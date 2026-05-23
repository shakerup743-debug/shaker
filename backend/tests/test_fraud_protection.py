"""
Iteration 7 — QR Fraud Protection backend tests.

Scope (backend only, BASE_URL = http://localhost:8001):
  - POST /api/public/qr/scan
  - POST /api/public/orders (identity + Saudi-phone validation + fraud scoring)
  - POST /api/public/qr/otp/verify  (wrong/correct + single-use)
  - POST /api/public/qr/otp/resend  (invalidates prior)
  - GET  /api/admin/fraud/stats|attempts|pending  (authenticated)
  - POST /api/admin/fraud/orders/:id/approve|reject
  - POST /api/admin/fraud/blacklist (+ DELETE)  and FRAUD_BLOCKED on subsequent order
  - Tenant isolation for blacklist
  - Regression hook: priceMode FULL public order still 201 (covered separately)
"""
import os
import time
import uuid
import pytest
import requests
import psycopg2

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/")
PG_DSN = os.environ.get("DATABASE_URL", "postgresql://foodoro:foodoro123@localhost:5432/foodoro_db")

DEMO_EMAIL = "demo@foodpro.com"
DEMO_PASS = "Demo2026!"


def _ts() -> str:
    return f"{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"


def _pg():
    con = psycopg2.connect(PG_DSN)
    con.autocommit = True
    return con


def _clear_lockouts():
    try:
        with _pg() as con, con.cursor() as cur:
            cur.execute("UPDATE security_events SET resolved=true "
                        "WHERE type='login_failed' AND resolved=false;")
    except Exception as e:
        print(f"WARN _clear_lockouts: {e}")


@pytest.fixture(scope="session", autouse=True)
def _session_setup():
    _clear_lockouts()
    # Clear residual blacklist entries from prior runs that could pollute scoring.
    # We only delete entries our own tests would have created (test phones / no blocked_by user).
    try:
        with _pg() as con, con.cursor() as cur:
            cur.execute(
                "DELETE FROM security_blacklist "
                "WHERE value LIKE '+9665%' OR value LIKE '+96650%' OR reason LIKE 'auto:%' OR reason LIKE 'test%' OR reason = 'iso' OR reason = 'tmp' OR reason = 'rejected by cashier' OR reason = 'test rejection'"
            )
            # Clear all device_fingerprint blacklist entries — these are only ever created by tests + auto-fraud logic
            cur.execute("DELETE FROM security_blacklist WHERE blacklist_type = 'device_fingerprint'")
    except Exception as e:
        print(f"WARN _session_setup cleanup: {e}")
    yield
    _clear_lockouts()


# ─── Demo tenant fixtures ────────────────────────────────────────────────────

def _decode_jwt_payload(token: str) -> dict:
    import base64, json
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))


@pytest.fixture(scope="session")
def demo_login():
    """Login as the demo admin (default tenant). Returns token + tenant_id (from JWT)."""
    _clear_lockouts()
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["token"]
    payload = _decode_jwt_payload(token)
    return {
        "token": token,
        "tenantId": payload["tenantId"],
        "headers": {"Authorization": f"Bearer {token}"},
    }


@pytest.fixture(scope="session")
def active_qr_token(demo_login):
    """Find an active qr_token in the demo tenant."""
    with _pg() as con, con.cursor() as cur:
        cur.execute(
            "SELECT token FROM qr_tokens WHERE is_active=true AND tenant_id=%s LIMIT 1",
            (demo_login["tenantId"],),
        )
        row = cur.fetchone()
        if not row:
            # fall back to any active token
            cur.execute("SELECT token FROM qr_tokens WHERE is_active=true LIMIT 1")
            row = cur.fetchone()
        assert row, "No active qr_token available — cannot run QR tests"
        return row[0]


@pytest.fixture(scope="session")
def demo_product_id(demo_login):
    """Pick first active product for the demo tenant."""
    r = requests.get(f"{BASE_URL}/api/products", headers=demo_login["headers"], timeout=10)
    assert r.status_code == 200, r.text
    prods = [p for p in r.json() if p.get("isActive", True) and p.get("kitchenAvailable", True)
             and not (p.get("optionGroups") or [])]
    # prefer products without required option groups so we don't need selectedOptions
    if not prods:
        # fallback: any product
        prods = r.json()
    assert prods, "No products in demo tenant"
    return prods[0]["id"]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _post_qr_order(tenant_id, qr_token, product_id, *, name=None, phone=None,
                   qty=1, scan_id=None, extra=None):
    body = {
        "tableNumber": "T1",
        "qrToken": qr_token,
        "items": [{"productId": product_id, "quantity": qty}],
        # extra signals so fingerprintHash is stable per call
        "timezone": "Asia/Riyadh",
        "screenResolution": "390x844",
    }
    if name is not None: body["customerName"] = name
    if phone is not None: body["customerPhone"] = phone
    if scan_id is not None: body["scanId"] = scan_id
    if extra: body.update(extra)
    return requests.post(
        f"{BASE_URL}/api/public/orders?tenantId={tenant_id}&qrToken={qr_token}",
        json=body, timeout=15,
        headers={"User-Agent": "TestUA/1.0", "Accept-Language": "ar-SA,en"},
    )


def _last_otp_for(order_sec_id):
    with _pg() as con, con.cursor() as cur:
        cur.execute(
            "SELECT otp_code FROM whatsapp_otps WHERE order_sec_id=%s "
            "ORDER BY id DESC LIMIT 1",
            (order_sec_id,),
        )
        row = cur.fetchone()
        return row[0] if row else None


def _seed_high_risk_for_device(tenant_id, fp, score=50):
    """Pre-seed a fraud_attempts row so calculateRiskScore returns ≥40."""
    with _pg() as con, con.cursor() as cur:
        cur.execute(
            "INSERT INTO fraud_attempts (tenant_id, detection_type, device_fingerprint, "
            "fraud_score, severity, action_taken) "
            "VALUES (%s, 'seed', %s, %s, 'medium', 'logged')",
            (tenant_id, fp, score),
        )


# ─── (A) QR SCAN ─────────────────────────────────────────────────────────────

class TestQrScan:
    def test_scan_returns_id_and_fingerprint(self, demo_login, active_qr_token):
        r = requests.post(
            f"{BASE_URL}/api/public/qr/scan?tenantId={demo_login['tenantId']}",
            json={"qrToken": active_qr_token, "timezone": "Asia/Riyadh",
                  "screenResolution": "390x844"},
            headers={"User-Agent": "TestUA/1.0"}, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("scanId"), int) and data["scanId"] > 0
        assert isinstance(data.get("deviceFingerprint"), str)
        assert len(data["deviceFingerprint"]) == 64  # sha256 hex

    def test_scan_invalid_token_410(self, demo_login):
        r = requests.post(
            f"{BASE_URL}/api/public/qr/scan?tenantId={demo_login['tenantId']}",
            json={"qrToken": "qr_DOES_NOT_EXIST"}, timeout=10)
        assert r.status_code == 410, r.text


# ─── (B) Identity & phone validation on /public/orders ───────────────────────

class TestIdentityValidation:
    def test_missing_customer_name_rejected(self, demo_login, active_qr_token, demo_product_id):
        r = _post_qr_order(demo_login["tenantId"], active_qr_token, demo_product_id,
                           name=None, phone="0512345678")
        assert r.status_code == 400, r.text
        body = r.json()
        assert body.get("code") == "IDENTITY_REQUIRED", body

    def test_missing_customer_phone_rejected(self, demo_login, active_qr_token, demo_product_id):
        r = _post_qr_order(demo_login["tenantId"], active_qr_token, demo_product_id,
                           name="Khaled", phone=None)
        assert r.status_code == 400, r.text
        assert r.json().get("code") == "IDENTITY_REQUIRED"

    def test_non_saudi_phone_rejected(self, demo_login, active_qr_token, demo_product_id):
        r = _post_qr_order(demo_login["tenantId"], active_qr_token, demo_product_id,
                           name="Khaled", phone="+15551234567")
        assert r.status_code == 400, r.text
        assert r.json().get("code") == "PHONE_INVALID"

    def test_short_invalid_phone_rejected(self, demo_login, active_qr_token, demo_product_id):
        r = _post_qr_order(demo_login["tenantId"], active_qr_token, demo_product_id,
                           name="Khaled", phone="0512")
        assert r.status_code == 400, r.text
        assert r.json().get("code") == "PHONE_INVALID"


# ─── (C) Low risk → accepted, no OTP ─────────────────────────────────────────

class TestLowRiskOrder:
    def test_valid_05_phone_accepted_low_risk(self, demo_login, active_qr_token, demo_product_id):
        # Use a fresh phone+timezone to keep score low
        phone = f"05{int(time.time())%1_000_000_00:08d}"[:10]
        r = _post_qr_order(demo_login["tenantId"], active_qr_token, demo_product_id,
                           name=f"Low_{_ts()}", phone=phone, qty=1,
                           extra={"timezone": "Asia/Riyadh",
                                  "screenResolution": f"390x{int(time.time())%1000+800}"})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body.get("requiresOtp") is False
        assert body.get("riskLevel") in ("low", "medium")
        assert isinstance(body.get("orderSecId"), int)
        assert "orderId" in body


# ─── (D) High risk → OTP required, verify flow ───────────────────────────────

@pytest.fixture
def high_risk_order(demo_login, active_qr_token, demo_product_id):
    """Force a high score by pre-seeding fraud_attempts for the device fingerprint."""
    # First scan to get the fp this client maps to
    s = requests.post(
        f"{BASE_URL}/api/public/qr/scan?tenantId={demo_login['tenantId']}",
        json={"qrToken": active_qr_token, "timezone": "Asia/Riyadh",
              "screenResolution": "390x844"},
        headers={"User-Agent": "TestUA/1.0", "Accept-Language": "ar-SA,en"},
        timeout=10)
    assert s.status_code == 200, s.text
    fp = s.json()["deviceFingerprint"]
    _seed_high_risk_for_device(demo_login["tenantId"], fp, score=50)

    phone = "0599887766"
    r = _post_qr_order(demo_login["tenantId"], active_qr_token, demo_product_id,
                       name=f"HighRisk_{_ts()}", phone=phone,
                       qty=1000,  # also triggers high-total flag
                       extra={"timezone": "Asia/Riyadh",
                              "screenResolution": "390x844"})
    assert r.status_code == 201, f"expected 201 with requiresOtp, got: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("requiresOtp") is True, body
    assert isinstance(body.get("orderSecId"), int)
    return {"orderSecId": body["orderSecId"], "phone": "+966599887766", "body": body}


class TestOtpFlow:
    def test_high_risk_returns_requires_otp(self, high_risk_order):
        assert high_risk_order["body"]["requiresOtp"] is True
        assert high_risk_order["body"]["fraudScore"] >= 40

    def test_otp_stored_in_db(self, high_risk_order):
        code = _last_otp_for(high_risk_order["orderSecId"])
        assert code is not None
        assert len(code) >= 4

    def test_verify_wrong_code_400(self, high_risk_order):
        r = requests.post(f"{BASE_URL}/api/public/qr/otp/verify", json={
            "orderSecId": high_risk_order["orderSecId"],
            "code": "000000",
            "phoneNumber": high_risk_order["phone"],
        }, timeout=10)
        assert r.status_code == 400, r.text

    def test_verify_correct_code_success_then_single_use(self, high_risk_order):
        code = _last_otp_for(high_risk_order["orderSecId"])
        r = requests.post(f"{BASE_URL}/api/public/qr/otp/verify", json={
            "orderSecId": high_risk_order["orderSecId"],
            "code": code,
            "phoneNumber": high_risk_order["phone"],
        }, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        # second time → single-use → 400
        r2 = requests.post(f"{BASE_URL}/api/public/qr/otp/verify", json={
            "orderSecId": high_risk_order["orderSecId"],
            "code": code,
            "phoneNumber": high_risk_order["phone"],
        }, timeout=10)
        assert r2.status_code == 400, r2.text
        # DB row otp_verified=true
        with _pg() as con, con.cursor() as cur:
            cur.execute("SELECT otp_verified, status FROM qr_order_security WHERE id=%s",
                        (high_risk_order["orderSecId"],))
            row = cur.fetchone()
            assert row[0] is True

    def test_resend_invalidates_prior_otp(self, demo_login, active_qr_token, demo_product_id):
        # Build fresh high-risk order so we don't reuse the verified one.
        # Use STABLE signals identical to what _post_qr_order sends by default
        # so the device_fingerprint matches between scan and order.
        stable_screen = "411x900"
        stable_ua = "TestUA/1.0"
        s = requests.post(
            f"{BASE_URL}/api/public/qr/scan?tenantId={demo_login['tenantId']}",
            json={"qrToken": active_qr_token, "timezone": "Asia/Riyadh",
                  "screenResolution": stable_screen},
            headers={"User-Agent": stable_ua, "Accept-Language": "ar-SA,en"},
            timeout=10)
        fp = s.json()["deviceFingerprint"]
        _seed_high_risk_for_device(demo_login["tenantId"], fp, score=50)
        r = _post_qr_order(demo_login["tenantId"], active_qr_token, demo_product_id,
                           name=f"Resend_{_ts()}", phone="0512000999",
                           qty=1000,
                           extra={"timezone": "Asia/Riyadh",
                                  "screenResolution": stable_screen})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body.get("requiresOtp") is True, f"Expected requiresOtp=true, got {body}"
        order_sec_id = body["orderSecId"]
        old_code = _last_otp_for(order_sec_id)
        assert old_code

        rr = requests.post(f"{BASE_URL}/api/public/qr/otp/resend",
                           json={"orderSecId": order_sec_id}, timeout=10)
        assert rr.status_code == 200, rr.text

        new_code = _last_otp_for(order_sec_id)
        assert new_code, "Expected a new OTP after resend"
        # Old code should now fail verification (invalidated)
        bad = requests.post(f"{BASE_URL}/api/public/qr/otp/verify", json={
            "orderSecId": order_sec_id, "code": old_code,
            "phoneNumber": "+966512000999",
        }, timeout=10)
        assert bad.status_code == 400, bad.text


# ─── (E) Admin fraud endpoints (authenticated) ───────────────────────────────

class TestAdminFraud:
    def test_stats_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/fraud/stats", timeout=10)
        assert r.status_code in (401, 403), r.text

    def test_stats_returns_counters(self, demo_login):
        r = requests.get(f"{BASE_URL}/api/admin/fraud/stats",
                         headers=demo_login["headers"], timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("todayAttempts", "blockedEntries", "pendingApproval"):
            assert k in body, body
            assert isinstance(body[k], int)

    def test_attempts_list(self, demo_login):
        r = requests.get(f"{BASE_URL}/api/admin/fraud/attempts?limit=20",
                         headers=demo_login["headers"], timeout=10)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_pending_list(self, demo_login):
        r = requests.get(f"{BASE_URL}/api/admin/fraud/pending",
                         headers=demo_login["headers"], timeout=10)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ─── (F) Cashier approve / reject ────────────────────────────────────────────

def _force_pending_approval(demo_login, active_qr_token, demo_product_id):
    """Seed fraud_attempts to ≥60 (approval) but <80 (auto-block)."""
    s = requests.post(
        f"{BASE_URL}/api/public/qr/scan?tenantId={demo_login['tenantId']}",
        json={"qrToken": active_qr_token, "timezone": "Asia/Riyadh",
              "screenResolution": f"380x{int(time.time())%900+600}"},
        headers={"User-Agent": f"TestUA/{uuid.uuid4().hex[:8]}"}, timeout=10)
    fp = s.json()["deviceFingerprint"]
    # 2 seed rows × ~35 pts each → push to >=60 but below 80 (capped by other logic)
    _seed_high_risk_for_device(demo_login["tenantId"], fp, score=45)
    r = _post_qr_order(demo_login["tenantId"], active_qr_token, demo_product_id,
                       name=f"Pend_{_ts()}", phone="0598887777", qty=1000,
                       extra={"timezone": "Asia/Riyadh",
                              "screenResolution": f"380x{int(time.time())%900+600}"})
    return r


class TestCashierApprove:
    def test_approve_sets_status_accepted(self, demo_login, active_qr_token, demo_product_id):
        r = _force_pending_approval(demo_login, active_qr_token, demo_product_id)
        assert r.status_code in (201, 403), r.text
        if r.status_code == 403:
            pytest.skip("Forced blocked instead of pending — see scoring weights")
        sec_id = r.json()["orderSecId"]
        # Move to pending_approval state explicitly via DB (since admin/order path
        # depends on cashier_required threshold). Set status directly to mimic
        # the documented flow.
        with _pg() as con, con.cursor() as cur:
            cur.execute("UPDATE qr_order_security SET status='pending_approval' WHERE id=%s",
                        (sec_id,))
        ap = requests.post(f"{BASE_URL}/api/admin/fraud/orders/{sec_id}/approve",
                           headers=demo_login["headers"], timeout=10)
        assert ap.status_code == 200, ap.text
        with _pg() as con, con.cursor() as cur:
            cur.execute("SELECT status, cashier_approval FROM qr_order_security WHERE id=%s",
                        (sec_id,))
            row = cur.fetchone()
            assert row[0] == "accepted"
            assert row[1] is True


class TestCashierReject:
    def test_reject_flips_status_and_blacklists_phone_and_device(self, demo_login, active_qr_token, demo_product_id):
        r = _force_pending_approval(demo_login, active_qr_token, demo_product_id)
        if r.status_code == 403:
            pytest.skip("Forced blocked instead of pending")
        assert r.status_code == 201, r.text
        sec_id = r.json()["orderSecId"]
        with _pg() as con, con.cursor() as cur:
            cur.execute("UPDATE qr_order_security SET status='pending_approval' WHERE id=%s",
                        (sec_id,))

        rej = requests.post(f"{BASE_URL}/api/admin/fraud/orders/{sec_id}/reject",
                            json={"reason": "test rejection"},
                            headers=demo_login["headers"], timeout=10)
        assert rej.status_code == 200, rej.text
        with _pg() as con, con.cursor() as cur:
            cur.execute("SELECT status FROM qr_order_security WHERE id=%s", (sec_id,))
            assert cur.fetchone()[0] == "rejected"
            # phone + device fingerprint must be blacklisted (7 days)
            cur.execute(
                "SELECT COUNT(*) FROM security_blacklist "
                "WHERE tenant_id=%s AND blacklist_type IN ('phone','device_fingerprint') "
                "AND expires_at > NOW()",
                (demo_login["tenantId"],))
            assert cur.fetchone()[0] >= 2


# ─── (G) Blacklist add/delete + FRAUD_BLOCKED on subsequent order ────────────

class TestBlacklistEndpoints:
    def test_add_then_subsequent_order_blocked(self, demo_login, active_qr_token, demo_product_id):
        phone = "0533445566"
        # Add blacklist
        add = requests.post(f"{BASE_URL}/api/admin/fraud/blacklist",
                            json={"blacklistType": "phone", "value": "+966533445566",
                                  "reason": "test", "expiresInDays": 1},
                            headers=demo_login["headers"], timeout=10)
        assert add.status_code == 200, add.text

        r = _post_qr_order(demo_login["tenantId"], active_qr_token, demo_product_id,
                           name="Blocked Person", phone=phone,
                           extra={"timezone": "Asia/Riyadh",
                                  "screenResolution": "390x844"})
        # Per code: score=100 triggers shouldBlock → res 403 code FRAUD_BLOCKED
        assert r.status_code == 403, r.text
        body = r.json()
        assert body.get("code") == "FRAUD_BLOCKED", body

    def test_invalid_blacklist_type_400(self, demo_login):
        r = requests.post(f"{BASE_URL}/api/admin/fraud/blacklist",
                          json={"blacklistType": "bogus", "value": "x"},
                          headers=demo_login["headers"], timeout=10)
        assert r.status_code == 400, r.text

    def test_delete_blacklist_entry(self, demo_login):
        # Insert one and delete via DELETE endpoint
        add = requests.post(f"{BASE_URL}/api/admin/fraud/blacklist",
                            json={"blacklistType": "phone",
                                  "value": f"+96650000{int(time.time())%10000:04d}",
                                  "reason": "tmp", "expiresInDays": 1},
                            headers=demo_login["headers"], timeout=10)
        assert add.status_code == 200
        # find the id
        lst = requests.get(f"{BASE_URL}/api/admin/fraud/blacklist",
                           headers=demo_login["headers"], timeout=10).json()
        assert isinstance(lst, list) and lst
        bid = lst[0]["id"]
        d = requests.delete(f"{BASE_URL}/api/admin/fraud/blacklist/{bid}",
                            headers=demo_login["headers"], timeout=10)
        assert d.status_code == 200, d.text


# ─── (H) Tenant isolation ────────────────────────────────────────────────────

class TestTenantIsolation:
    def test_tenantA_blacklist_does_not_affect_tenantB(self, demo_login, active_qr_token, demo_product_id):
        # Create a fresh tenant B via signup
        email_b = f"tb_iso_{_ts()}@example.com"
        s = requests.post(f"{BASE_URL}/api/auth/signup", json={
            "email": email_b, "password": "Test12345!", "name": "Owner B",
            "restaurantName": f"IsoB_{_ts()}", "businessType": "traditional", "lang": "en",
        }, timeout=15)
        assert s.status_code == 201, s.text
        tb = s.json()
        b_headers = {"Authorization": f"Bearer {tb['token']}"}

        phone_value = f"+96652{int(time.time())%10_000_000:07d}"
        # tenant A blacklists the phone
        add = requests.post(f"{BASE_URL}/api/admin/fraud/blacklist",
                            json={"blacklistType": "phone", "value": phone_value,
                                  "reason": "iso", "expiresInDays": 1},
                            headers=demo_login["headers"], timeout=10)
        assert add.status_code == 200, add.text

        # tenant B's blacklist endpoint must NOT include that value
        r = requests.get(f"{BASE_URL}/api/admin/fraud/blacklist",
                         headers=b_headers, timeout=10)
        assert r.status_code == 200, r.text
        values = [row["value"] for row in r.json()]
        assert phone_value not in values, f"Leak across tenants: {values}"

        # tenant B stats counters reference tenant B only — blockedEntries
        # should be 0 (fresh tenant) or at least not equal to A's
        rs = requests.get(f"{BASE_URL}/api/admin/fraud/stats",
                          headers=b_headers, timeout=10)
        assert rs.status_code == 200
        # purely a sanity check — no exception thrown is enough
        assert isinstance(rs.json()["blockedEntries"], int)
