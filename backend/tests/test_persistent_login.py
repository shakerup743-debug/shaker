"""
Persistent Login (Refresh Token) tests — iteration 8.

Covers the 4 scenarios from the P0 review request:
  1. POST /api/auth/login returns {token, user} AND sets HttpOnly cookie
     foodoro_rt with SameSite=Lax, path=/api/auth, Max-Age 2592000 (30d).
  2. POST /api/auth/refresh works WITHOUT Authorization header (cookie only),
     returns a new token and rotates the refresh cookie. JWT exp = 7d.
  3. POST /api/auth/refresh with NO cookie → 401 {code: 'NO_REFRESH'}.
  4. Token rotation: 2 consecutive refreshes produce different tokens AND
     the DB shows a replaced_by_id chain. Reuse of a replaced token → 401 REUSED.
  5. POST /api/auth/logout works WITHOUT a valid Bearer (cookie revokes chain
     + clears cookie).
  6. AI engines still return success:true (regression).
"""
import base64
import json
import os
import time

import pytest
import psycopg2
import requests

BACKEND_URL = "http://localhost:8001"
EMAIL = "demo@foodpro.com"
PASSWORD = "Demo2026!"

DB_DSN = "host=localhost dbname=foodoro_db user=foodoro password=foodoro123"


def _clear_rate_limit():
    with psycopg2.connect(DB_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE security_events SET resolved=true "
            "WHERE type IN ('login_failed','login_blocked') AND resolved=false;"
        )


@pytest.fixture(scope="module", autouse=True)
def _setup():
    _clear_rate_limit()
    yield


@pytest.fixture
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def logged_in(session):
    _clear_rate_limit()
    r = session.post(f"{BACKEND_URL}/api/auth/login",
                     json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r


# ── 1) Login issues refresh cookie ─────────────────────────────────────────────
class TestLoginIssuesCookie:
    def test_login_returns_token_and_user(self, logged_in):
        body = logged_in.json()
        assert "token" in body and isinstance(body["token"], str) and body["token"]
        assert body["user"]["email"] == EMAIL

    def test_login_sets_foodoro_rt_cookie_with_correct_flags(self, logged_in):
        # `requests` lowercases header names but preserves Set-Cookie list
        set_cookies = logged_in.raw.headers.getlist("Set-Cookie") \
            if hasattr(logged_in.raw.headers, "getlist") else \
            [h for k, h in logged_in.raw.headers.items() if k.lower() == "set-cookie"]
        rt = next((c for c in set_cookies if c.startswith("foodoro_rt=")), None)
        assert rt, f"foodoro_rt cookie missing. Got: {set_cookies}"
        assert "HttpOnly" in rt
        assert "SameSite=Lax" in rt
        assert "Path=/api/auth" in rt
        assert "Max-Age=2592000" in rt

    def test_jwt_exp_is_seven_days(self, logged_in):
        token = logged_in.json()["token"]
        payload_b64 = token.split(".")[1]
        # JWT base64url padding
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        ttl = payload["exp"] - payload["iat"]
        # 7 days in seconds = 604800; allow ±60s
        assert 604740 <= ttl <= 604860, f"JWT TTL is {ttl}s, expected ~604800 (7d)"


# ── 2) Refresh works cookie-only ───────────────────────────────────────────────
class TestRefreshCookieOnly:
    def test_refresh_no_cookie_returns_401_no_refresh(self, session):
        r = session.post(f"{BACKEND_URL}/api/auth/refresh")
        assert r.status_code == 401
        body = r.json()
        assert body.get("code") == "NO_REFRESH"

    def test_refresh_uses_cookie_without_bearer(self, logged_in, session):
        # `session` already has the cookie jar populated from login
        # Explicitly do NOT send Authorization header
        r = session.post(f"{BACKEND_URL}/api/auth/refresh",
                         headers={"Authorization": ""})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and body["token"]
        assert body["token"] != logged_in.json()["token"]
        # Verify a new foodoro_rt was issued (rotation)
        set_cookies = r.raw.headers.getlist("Set-Cookie") \
            if hasattr(r.raw.headers, "getlist") else \
            [h for k, h in r.raw.headers.items() if k.lower() == "set-cookie"]
        assert any(c.startswith("foodoro_rt=") for c in set_cookies), \
            f"new refresh cookie missing on rotation: {set_cookies}"


# ── 3) Rotation + reuse detection ─────────────────────────────────────────────
class TestRotationAndReuse:
    def test_two_refreshes_produce_different_tokens(self, logged_in, session):
        r1 = session.post(f"{BACKEND_URL}/api/auth/refresh")
        assert r1.status_code == 200, r1.text
        t1 = r1.json()["token"]
        time.sleep(1)
        r2 = session.post(f"{BACKEND_URL}/api/auth/refresh")
        assert r2.status_code == 200, r2.text
        t2 = r2.json()["token"]
        assert t1 != t2

    def test_db_chain_has_replaced_by_id(self, logged_in, session):
        # Trigger one rotation
        r = session.post(f"{BACKEND_URL}/api/auth/refresh")
        assert r.status_code == 200
        user_id = logged_in.json()["user"]["id"]

        with psycopg2.connect(DB_DSN) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT id, replaced_by_id, revoked "
                "FROM refresh_tokens WHERE user_id=%s ORDER BY id ASC;",
                (user_id,),
            )
            rows = cur.fetchall()

        # At least 2 rows; at least one has replaced_by_id pointing forward
        assert len(rows) >= 2
        chain = [r for r in rows if r[1] is not None]
        assert chain, "No refresh_tokens row has replaced_by_id set"

    def test_reused_token_returns_401_reused(self, session):
        # Login fresh — grab the cookie BEFORE any rotation
        _clear_rate_limit()
        r = session.post(f"{BACKEND_URL}/api/auth/login",
                         json={"email": EMAIL, "password": PASSWORD})
        assert r.status_code == 200, r.text
        original_cookie = session.cookies.get("foodoro_rt")
        assert original_cookie

        # First refresh — should succeed and rotate the cookie
        r1 = session.post(f"{BACKEND_URL}/api/auth/refresh")
        assert r1.status_code == 200, r1.text

        # Now replay the ORIGINAL (already-replaced) cookie on a fresh session
        replay = requests.Session()
        replay.cookies.set("foodoro_rt", original_cookie, path="/api/auth")
        r2 = replay.post(f"{BACKEND_URL}/api/auth/refresh")
        assert r2.status_code == 401, r2.text
        assert r2.json().get("code") == "REUSED", r2.json()


# ── 4) Logout works without Bearer ─────────────────────────────────────────────
class TestLogout:
    def test_logout_without_bearer_clears_cookie_and_revokes_chain(self, session):
        _clear_rate_limit()
        r = session.post(f"{BACKEND_URL}/api/auth/login",
                         json={"email": EMAIL, "password": PASSWORD})
        assert r.status_code == 200, r.text
        user_id = r.json()["user"]["id"]

        # Logout WITHOUT Authorization header
        out = session.post(f"{BACKEND_URL}/api/auth/logout",
                          headers={"Authorization": ""})
        assert out.status_code == 204

        # Set-Cookie should clear foodoro_rt
        set_cookies = out.raw.headers.getlist("Set-Cookie") \
            if hasattr(out.raw.headers, "getlist") else \
            [h for k, h in out.raw.headers.items() if k.lower() == "set-cookie"]
        cleared = any(
            "foodoro_rt=" in c and ("Max-Age=0" in c or "Expires=" in c)
            for c in set_cookies
        )
        assert cleared, f"foodoro_rt not cleared. Got: {set_cookies}"

        # DB: every refresh_token row for this user should be revoked
        with psycopg2.connect(DB_DSN) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM refresh_tokens "
                "WHERE user_id=%s AND revoked=false;",
                (user_id,),
            )
            active = cur.fetchone()[0]
        assert active == 0, f"{active} refresh tokens still active after logout"

        # And refresh on the same session must now fail
        r2 = session.post(f"{BACKEND_URL}/api/auth/refresh")
        assert r2.status_code == 401


# ── 5) AI engines regression ───────────────────────────────────────────────────
class TestAiEnginesRegression:
    @pytest.fixture
    def auth_header(self, logged_in):
        return {"Authorization": f"Bearer {logged_in.json()['token']}"}

    def test_daily_predictions(self, auth_header):
        r = requests.get(f"{BACKEND_URL}/api/ai/predictions/daily", headers=auth_header)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True

    def test_trending_recommendations(self, auth_header):
        r = requests.get(f"{BACKEND_URL}/api/ai/recommendations/trending", headers=auth_header)
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True

    def test_anomalies(self, auth_header):
        r = requests.get(f"{BACKEND_URL}/api/ai/anomalies", headers=auth_header)
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True
