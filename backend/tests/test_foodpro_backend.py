"""FoodPro POS — backend API tests for currencies, exchange-rates, subscription, orders & more."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com",
).rstrip("/")

DEMO_EMAIL = "demo@foodpro.com"
DEMO_PASSWORD = "Demo2026!"


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


# ---------------- Public ----------------
class TestPublic:
    def test_subscription_plans(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/subscription/plans", timeout=15)
        assert r.status_code == 200
        data = r.json()
        plans = data.get("plans", [])
        ids = {p["id"] for p in plans}
        assert {"starter", "growth", "enterprise"}.issubset(ids), ids


# ---------------- Auth ----------------
class TestAuth:
    def test_login_success(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert "token" in body
        assert body["user"]["email"] == DEMO_EMAIL

    def test_login_invalid(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO_EMAIL, "password": "WRONG"},
            timeout=15,
        )
        assert r.status_code in (400, 401, 403)


# ---------------- Subscription ----------------
class TestSubscription:
    def test_current_subscription(self, authed):
        r = authed.get(f"{BASE_URL}/api/subscription", timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # Plan may be nested or top-level — accept both
        plan = data.get("plan") or data.get("planId") or data.get("subscription", {}).get("plan")
        status = data.get("status") or data.get("subscription", {}).get("status")
        assert plan == "enterprise", f"plan={plan} body={data}"
        assert status == "active", f"status={status} body={data}"


# ---------------- Currencies & Exchange Rates ----------------
class TestCurrencies:
    def test_currencies_list(self, authed):
        r = authed.get(f"{BASE_URL}/api/currencies", timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        arr = data if isinstance(data, list) else data.get("currencies", [])
        assert len(arr) >= 16, f"got {len(arr)} currencies"
        sample = arr[0]
        for k in ("code", "symbol", "nameEn", "nameAr"):
            assert k in sample, f"missing {k} in {sample}"

    def test_rates_sar(self, authed):
        r = authed.get(f"{BASE_URL}/api/exchange-rates?base=SAR", timeout=20)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        rates = data if isinstance(data, list) else data.get("rates", [])
        assert len(rates) > 100, f"got only {len(rates)} rate rows for SAR"

    def test_refresh_usd(self, authed):
        r = authed.post(
            f"{BASE_URL}/api/exchange-rates/refresh",
            json={"base": "USD"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data.get("ok") is True, data

    def test_rates_usd_includes_sar(self, authed):
        # Make sure prior refresh persisted
        time.sleep(1)
        r = authed.get(f"{BASE_URL}/api/exchange-rates?base=USD", timeout=20)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        rates = data if isinstance(data, list) else data.get("rates", [])
        assert len(rates) >= 150, f"expected ≥150 USD rate rows, got {len(rates)}"
        codes = {row.get("target_currency") or row.get("quote") or row.get("code") or row.get("target") for row in rates}
        assert "SAR" in codes, f"SAR not in USD rates; sample={sorted(c for c in codes if c)[:30]}"


# ---------------- Products / Orders ----------------
class TestProductsAndOrders:
    def test_products_list(self, authed):
        r = authed.get(f"{BASE_URL}/api/products", timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        arr = data if isinstance(data, list) else data.get("products", data.get("items", []))
        assert isinstance(arr, list)

    def test_order_create_and_complete(self, authed):
        rp = authed.get(f"{BASE_URL}/api/products", timeout=15)
        assert rp.status_code == 200
        data = rp.json()
        products = data if isinstance(data, list) else data.get("products", data.get("items", []))
        if not products:
            pytest.skip("no products available for demo tenant")
        p = products[0]
        pid = p.get("id") or p.get("productId")
        price = p.get("price") or p.get("unitPrice") or 10
        payload = {
            "items": [{"productId": pid, "quantity": 1, "price": price}],
            "type": "dine_in",
            "orderType": "dine_in",
        }
        r = authed.post(f"{BASE_URL}/api/orders", json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text[:300]
        body = r.json()
        oid = body.get("id") or body.get("orderId") or body.get("order", {}).get("id")
        assert oid, f"no order id returned: {body}"
        rc = authed.post(f"{BASE_URL}/api/orders/{oid}/complete", json={"paymentMethod": "cash"}, timeout=20)
        assert rc.status_code in (200, 204), rc.text[:300]


# ---------------- QR / Discounts / Invoice / MasterPassword ----------------
class TestMisc:
    def test_qr_orders(self, authed):
        r = authed.get(f"{BASE_URL}/api/qr-orders", timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "orders" in data or isinstance(data, list), data

    def test_discounts_settings(self, authed):
        # After fix, both aliased paths should return 200.
        r_spec = authed.get(f"{BASE_URL}/api/discounts/settings", timeout=15)
        r_real = authed.get(f"{BASE_URL}/api/discount-settings", timeout=15)
        assert r_real.status_code == 200, r_real.text[:200]
        assert r_spec.status_code == 200, (
            f"/api/discounts/settings still {r_spec.status_code}: {r_spec.text[:200]}"
        )
        assert isinstance(r_spec.json(), dict)
        assert isinstance(r_real.json(), dict)

    def test_invoice_settings(self, authed):
        r = authed.get(f"{BASE_URL}/api/invoice-settings", timeout=15)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), dict)

    def test_master_password_status(self, authed):
        r = authed.get(f"{BASE_URL}/api/security/master-password/status", timeout=15)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), dict)


# ---------------- WebSocket / Service Worker ----------------
class TestRealtime:
    def _ws_handshake(self, host, port, use_tls, path, auth_token):
        import socket, base64, os as _os
        raw = socket.create_connection((host, port), timeout=8)
        sock = raw
        if use_tls:
            import ssl
            ctx = ssl.create_default_context()
            sock = ctx.wrap_socket(raw, server_hostname=host)
        key = base64.b64encode(_os.urandom(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"Authorization: Bearer {auth_token}\r\n\r\n"
        )
        sock.sendall(req.encode())
        resp = sock.recv(512).decode(errors="ignore")
        sock.close()
        first = resp.split("\r\n", 1)[0] if resp else "empty"
        return ("101" in first), first

    def test_ws_upgrade_api_public(self, auth_token):
        # /api/ws MUST upgrade via the public ingress (review request).
        host = BASE_URL.replace("https://", "").replace("http://", "").split("/")[0]
        port = 443 if BASE_URL.startswith("https") else 80
        ok, first = self._ws_handshake(host, port, BASE_URL.startswith("https"), "/api/ws", auth_token)
        assert ok, f"/api/ws public upgrade failed: {first}"

    def test_ws_upgrade_ws_alias_local(self, auth_token):
        # /ws alias should still work on localhost.
        ok, first = self._ws_handshake("localhost", 8001, False, "/ws", auth_token)
        assert ok, f"/ws localhost upgrade failed: {first}"

    def test_ws_upgrade_api_ws_local(self, auth_token):
        # /api/ws should also upgrade locally.
        ok, first = self._ws_handshake("localhost", 8001, False, "/api/ws", auth_token)
        assert ok, f"/api/ws localhost upgrade failed: {first}"

    def test_service_worker_js(self, api_client):
        r = api_client.get(f"{BASE_URL}/sw.js", timeout=15)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:200]}"
        ctype = r.headers.get("content-type", "")
        assert "javascript" in ctype.lower() or "text/" in ctype.lower(), ctype
        assert len(r.text) > 50
