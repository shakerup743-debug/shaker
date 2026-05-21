"""FoodPro POS — Iteration 3 backend tests.

Covers the newly added/updated areas:
  - Product image upload + PATCH imageUrl + static serve
  - QR Orders endpoint
  - Discount settings GET/PUT with role caps (with both alias paths)
  - Invoice settings GET/PUT + QR data-URL
  - Master Password (status / create / verify) full lifecycle
  - Subscription unlocked via demo_mode
  - Coupons CRUD
  - Exchange rates regression
  - WebSocket /api/ws upgrade
  - Service worker + manifest
  - Auth + products regression

Run:
  pytest /app/backend/tests/test_foodpro_iteration3.py -v \
    --junitxml=/app/test_reports/pytest/iteration3_results.xml
"""
import os
import base64
import time
import socket
import ssl
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com",
).rstrip("/")

DEMO_EMAIL = "demo@foodpro.com"
DEMO_PASSWORD = "Demo2026!"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(api_client):
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def authed(api_client, auth_token):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}",
    })
    return s


# ---------- Auth + Subscription regression ----------
class TestAuthAndSubscription:
    def test_login(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["email"] == DEMO_EMAIL
        assert isinstance(body.get("token"), str) and len(body["token"]) > 10

    def test_subscription_demo_mode_unlocks_enterprise(self, authed):
        r = authed.get(f"{BASE_URL}/api/subscription", timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        plan = d.get("plan") or d.get("planId") or d.get("subscription", {}).get("plan")
        status = d.get("status") or d.get("subscription", {}).get("status")
        assert plan == "enterprise", f"plan={plan} body={d}"
        assert status == "active", f"status={status} body={d}"


# ---------- Products + image upload + serve ----------
class TestProductsAndImage:
    def test_products_list_has_seeded(self, authed):
        r = authed.get(f"{BASE_URL}/api/products", timeout=15)
        assert r.status_code == 200
        data = r.json()
        arr = data if isinstance(data, list) else data.get("products", data.get("items", []))
        assert isinstance(arr, list) and len(arr) >= 2, f"expected ≥2 seeded products, got {len(arr)}"
        # Category info present
        first = arr[0]
        assert "categoryName" in first or "categoryId" in first or "category" in first, first

    def test_upload_image_base64_and_patch_product(self, authed):
        # 1) Upload a tiny PNG via base64 endpoint
        # 1x1 transparent PNG
        png_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII="
        )
        data_url = "data:image/png;base64," + base64.b64encode(png_bytes).decode()
        r = authed.post(f"{BASE_URL}/api/uploads/image-base64", json={"dataUrl": data_url}, timeout=20)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert body.get("ok") is True
        url = body.get("url")
        assert isinstance(url, str) and url.startswith("/api/uploads/products/"), url

        # 2) Verify the file is served (status 200 + image content-type)
        full = f"{BASE_URL}{url}"
        s = authed.get(full, timeout=15)
        assert s.status_code == 200, f"serve failed {s.status_code} {s.text[:120]}"
        ctype = s.headers.get("content-type", "")
        assert "image" in ctype.lower(), f"unexpected content-type: {ctype}"

        # 3) PATCH the first product to attach imageUrl, then GET to verify persistence
        rp = authed.get(f"{BASE_URL}/api/products", timeout=15)
        prods = rp.json() if isinstance(rp.json(), list) else rp.json().get("products", rp.json().get("items", []))
        pid = prods[0].get("id") or prods[0].get("productId")
        assert pid, prods[0]

        patch = authed.patch(f"{BASE_URL}/api/products/{pid}", json={"imageUrl": url}, timeout=15)
        assert patch.status_code == 200, f"patch failed: {patch.status_code} {patch.text[:200]}"
        updated = patch.json()
        assert updated.get("imageUrl") == url, f"imageUrl not echoed back: {updated}"

        # Verify persistence on a fresh GET
        g = authed.get(f"{BASE_URL}/api/products/{pid}", timeout=15)
        assert g.status_code == 200
        assert g.json().get("imageUrl") == url, g.json()


# ---------- QR Orders ----------
class TestQrOrders:
    def test_qr_orders_list(self, authed):
        r = authed.get(f"{BASE_URL}/api/qr-orders", timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "orders" in data or isinstance(data, list), data
        if "orders" in data:
            assert isinstance(data["orders"], list)


# ---------- Discount Settings ----------
class TestDiscountSettings:
    def test_get_seeded_10_roles(self, authed):
        r = authed.get(f"{BASE_URL}/api/discounts/settings", timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        items = d.get("settings", [])
        assert isinstance(items, list)
        assert len(items) >= 10, f"expected ≥10 default roles seeded, got {len(items)}: {items[:3]}"
        # Validate shape
        sample = items[0]
        for k in ("role", "max_discount_percent"):
            assert k in sample, f"missing {k} in {sample}"

    def test_put_persists_cashier_15pct(self, authed):
        payload = {
            "settings": [{
                "role": "cashier",
                "max_discount_percent": 15,
                "max_discount_amount": 50,
                "max_daily_uses": 5,
                "requires_reason": True,
            }]
        }
        r = authed.put(f"{BASE_URL}/api/discount-settings", json=payload, timeout=15)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("ok") is True

        # Verify persistence
        g = authed.get(f"{BASE_URL}/api/discounts/settings", timeout=15)
        assert g.status_code == 200
        items = g.json().get("settings", [])
        cashier = next((x for x in items if x.get("role") == "cashier"), None)
        assert cashier is not None, items
        # Accept int / float / str (DB returns numeric → "15.00")
        mdp = cashier.get("max_discount_percent")
        assert float(mdp) == 15.0, f"cashier max_discount_percent={mdp}"


# ---------- Invoice Settings ----------
class TestInvoiceSettings:
    def test_get_invoice_settings_initial(self, authed):
        r = authed.get(f"{BASE_URL}/api/invoice-settings", timeout=15)
        assert r.status_code == 200, r.text[:300]
        # may be {settings: null} or {settings: {...}}
        d = r.json()
        assert isinstance(d, dict)
        assert "settings" in d or "logoUrl" in d or "paperSize" in d, d

    def test_put_invoice_settings_persists(self, authed):
        payload = {
            "logoUrl": "/api/uploads/products/demo-logo.png",
            "restaurantName": "FoodPro Demo",
            "paperSize": "A5",
            "welcomeMessage": "Welcome to FoodPro!",
            "footerText": "Thank you, come again.",
            "showTax": True,
            "showLogo": True,
        }
        r = authed.put(f"{BASE_URL}/api/invoice-settings", json=payload, timeout=15)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("ok") is True

        g = authed.get(f"{BASE_URL}/api/invoice-settings", timeout=15)
        assert g.status_code == 200
        body = g.json()
        s = body.get("settings") if isinstance(body.get("settings"), dict) else body
        assert s, body
        # GET returns raw snake_case columns from invoice_settings table
        paper = s.get("paperSize") or s.get("paper_size")
        rname = s.get("restaurantName") or s.get("restaurant_name")
        wmsg = s.get("welcomeMessage") or s.get("welcome_message")
        assert paper == "A5", f"paperSize={paper} body={s}"
        assert rname == "FoodPro Demo", f"restaurantName={rname}"
        assert wmsg == "Welcome to FoodPro!", f"welcomeMessage={wmsg}"

    def test_qr_data_url(self, authed):
        r = authed.get(f"{BASE_URL}/api/invoice-settings/qr", timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "url" in d and "dataUrl" in d, d
        du = d["dataUrl"]
        assert isinstance(du, str) and du.startswith("data:image/png;base64,"), du[:60]
        assert len(du) > 100, f"dataUrl too short: {len(du)}"


# ---------- Master Password ----------
class TestMasterPassword:
    """Lifecycle test — order matters. Tests state but cleans up nothing
    (DB state persists across runs; if MP already exists from a prior run we still
    verify the {exists:true} + verify endpoints work)."""

    def test_full_lifecycle(self, authed):
        # 1) Status — exists may be true or false depending on whether a previous
        #    test run already created one (we run against a long-lived demo tenant).
        r = authed.get(f"{BASE_URL}/api/security/master-password/status", timeout=15)
        assert r.status_code == 200, r.text[:300]
        st = r.json()
        assert "exists" in st, st
        already_exists = bool(st["exists"])

        test_pw = "TestMaster2026!"

        # 2) If not exists, create it. If it exists, skip create (would 409).
        if not already_exists:
            c = authed.post(
                f"{BASE_URL}/api/security/master-password/create",
                json={"password": test_pw},
                timeout=15,
            )
            assert c.status_code in (200, 201), f"create failed: {c.status_code} {c.text[:200]}"
            cb = c.json()
            assert cb.get("ok") is True
            codes = cb.get("backupCodes", [])
            assert isinstance(codes, list) and len(codes) == 8, codes

            # Status should now exist
            r2 = authed.get(f"{BASE_URL}/api/security/master-password/status", timeout=15)
            assert r2.status_code == 200 and r2.json().get("exists") is True, r2.text[:200]
        else:
            # If it already exists from a prior run, just record that we couldn't
            # verify the "correct password" path with a known plaintext.
            pytest.skip(
                "master-password already configured for demo tenant from a prior run; "
                "create+verify-correct cannot be tested without resetting DB. "
                "verify-wrong path is tested separately below."
            )

        # 3) Verify with WRONG password → 401
        bad = authed.post(
            f"{BASE_URL}/api/security/verify-master-password",
            json={"password": "WRONG-PASSWORD-1234"},
            timeout=15,
        )
        assert bad.status_code == 401, f"expected 401, got {bad.status_code}: {bad.text[:200]}"

        # 4) Verify with CORRECT password → 200
        ok = authed.post(
            f"{BASE_URL}/api/security/verify-master-password",
            json={"password": test_pw, "operationKey": "test_run", "reason": "iteration3"},
            timeout=15,
        )
        assert ok.status_code == 200, f"expected 200, got {ok.status_code}: {ok.text[:200]}"
        assert ok.json().get("ok") is True

    def test_verify_wrong_password_returns_401_regardless(self, authed):
        # This test stands on its own — works whether MP existed before or was just created.
        st = authed.get(f"{BASE_URL}/api/security/master-password/status", timeout=15).json()
        if not st.get("exists"):
            pytest.skip("MP not configured; nothing to verify-wrong against")
        bad = authed.post(
            f"{BASE_URL}/api/security/verify-master-password",
            json={"password": "definitely-wrong-xyz-9999"},
            timeout=15,
        )
        assert bad.status_code == 401, f"got {bad.status_code}: {bad.text[:200]}"


# ---------- Coupons CRUD ----------
class TestCouponsCRUD:
    def test_full_crud(self, authed):
        code = f"TEST{int(time.time())}"
        payload = {
            "code": code,
            "type": "percent",
            "value": 10,
            "discountType": "percent",
            "discountValue": 10,
            "active": True,
        }
        c = authed.post(f"{BASE_URL}/api/coupons", json=payload, timeout=15)
        assert c.status_code in (200, 201), f"create failed: {c.status_code} {c.text[:300]}"
        body = c.json()
        cid = body.get("id") or body.get("couponId") or body.get("coupon", {}).get("id")
        assert cid, body

        # List
        g = authed.get(f"{BASE_URL}/api/coupons", timeout=15)
        assert g.status_code == 200
        items = g.json() if isinstance(g.json(), list) else g.json().get("coupons", g.json().get("items", []))
        assert any((it.get("id") == cid or it.get("code") == code) for it in items), items[:3]

        # Delete
        d = authed.delete(f"{BASE_URL}/api/coupons/{cid}", timeout=15)
        assert d.status_code in (200, 204), f"delete failed: {d.status_code} {d.text[:200]}"

        # Confirm removed
        g2 = authed.get(f"{BASE_URL}/api/coupons", timeout=15)
        items2 = g2.json() if isinstance(g2.json(), list) else g2.json().get("coupons", g2.json().get("items", []))
        assert not any(it.get("id") == cid for it in items2), "coupon still present after delete"


# ---------- Exchange Rates regression ----------
class TestExchangeRates:
    def test_sar_has_100_rows(self, authed):
        r = authed.get(f"{BASE_URL}/api/exchange-rates?base=SAR", timeout=20)
        assert r.status_code == 200
        rates = r.json() if isinstance(r.json(), list) else r.json().get("rates", [])
        assert len(rates) >= 100, f"got {len(rates)} rows"
        codes = {row.get("target_currency") or row.get("quote") or row.get("code") for row in rates}
        for c in ("USD", "EUR", "AED", "KWD", "EGP"):
            assert c in codes, f"{c} missing from SAR rates; sample={sorted(x for x in codes if x)[:25]}"


# ---------- WebSocket /api/ws ----------
class TestWebSocket:
    def test_ws_api_public_upgrade(self, auth_token):
        host = BASE_URL.replace("https://", "").replace("http://", "").split("/")[0]
        use_tls = BASE_URL.startswith("https")
        port = 443 if use_tls else 80
        raw = socket.create_connection((host, port), timeout=8)
        sock = raw
        if use_tls:
            ctx = ssl.create_default_context()
            sock = ctx.wrap_socket(raw, server_hostname=host)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET /api/ws HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"Authorization: Bearer {auth_token}\r\n\r\n"
        )
        sock.sendall(req.encode())
        resp = sock.recv(512).decode(errors="ignore")
        sock.close()
        first = resp.split("\r\n", 1)[0] if resp else "empty"
        assert "101" in first, f"/api/ws upgrade failed: {first}"


# ---------- Service Worker + Manifest ----------
class TestPwaAssets:
    def test_service_worker(self, api_client):
        r = api_client.get(f"{BASE_URL}/sw.js", timeout=15)
        assert r.status_code == 200, f"status={r.status_code}"
        ctype = r.headers.get("content-type", "").lower()
        assert "javascript" in ctype or "text/" in ctype, ctype
        assert len(r.text) > 50

    def test_manifest_webmanifest(self, api_client):
        r = api_client.get(f"{BASE_URL}/manifest.webmanifest", timeout=15)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:200]}"
        # content-type is often application/manifest+json
        body = r.text
        assert "{" in body and "}" in body, body[:200]
