"""
Backend tests for:
 (A) Brute-force lockout per (email+ip) — bug-fix validation
 (B) Product Variants / Option Groups feature — end-to-end

NOTE: testing_type=backend only. BASE_URL = http://localhost:8001 per review_request.
"""
import os
import time
import uuid
import pytest
import requests
import psycopg2

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/")
PG_DSN = "postgresql://foodoro:foodoro123@localhost:5432/foodoro_db"

DEMO_EMAIL = "demo@foodpro.com"
DEMO_PASS = "Demo2026!"


def _ts() -> str:
    return f"{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"


def _clear_lockouts():
    """Clear unresolved login_failed events so lockouts don't leak between tests."""
    try:
        con = psycopg2.connect(PG_DSN)
        con.autocommit = True
        with con.cursor() as cur:
            cur.execute("UPDATE security_events SET resolved=true "
                        "WHERE type='login_failed' AND resolved=false;")
        con.close()
    except Exception as e:
        print(f"WARN _clear_lockouts: {e}")


@pytest.fixture(autouse=True)
def _reset_brute_force():
    _clear_lockouts()
    yield
    _clear_lockouts()


def _signup(email: str, password: str = "Test12345!") -> dict:
    r = requests.post(f"{BASE_URL}/api/auth/signup", json={
        "email": email,
        "password": password,
        "name": "Test User",
        "restaurantName": f"R{_ts()}",
        "businessType": "traditional",
        "lang": "en",
    }, timeout=15)
    assert r.status_code == 201, f"signup failed: {r.status_code} {r.text}"
    return r.json()


def _login(email: str, password: str) -> requests.Response:
    return requests.post(f"{BASE_URL}/api/auth/login",
                         json={"email": email, "password": password}, timeout=15)


# ─── (A) AUTH ────────────────────────────────────────────────────────────────

class TestAuth:

    def test_signup_logout_login_again(self):
        email = f"test_{_ts()}@example.com"
        s = _signup(email)
        token = s["token"]
        assert s["user"]["email"] == email
        # logout
        rlo = requests.post(f"{BASE_URL}/api/auth/logout",
                            headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert rlo.status_code == 204
        # login again
        r2 = _login(email, "Test12345!")
        assert r2.status_code == 200, r2.text
        assert "token" in r2.json()

    def test_6_wrong_passwords_same_email_locks_with_email_ip_scope(self):
        email = f"lock_{_ts()}@example.com"
        _signup(email)
        # 5 wrong attempts: expect 401
        for i in range(5):
            r = _login(email, "WrongPass!")
            assert r.status_code == 401, f"attempt {i+1}: {r.status_code}"
        # 6th attempt should be 429 with scope email_ip
        r6 = _login(email, "WrongPass!")
        assert r6.status_code == 429, f"6th: {r6.status_code} {r6.text}"
        body = r6.json()
        assert body.get("scope") == "email_ip", body

    def test_lockout_is_per_email_other_email_not_blocked(self):
        victim = f"victim_{_ts()}@example.com"
        bystander = f"bys_{_ts()}@example.com"
        _signup(victim)
        # lock the victim
        for _ in range(6):
            _login(victim, "WrongPass!")
        # bystander signup must still work from same IP
        s = _signup(bystander)
        assert s["user"]["email"] == bystander
        # bystander login must also work
        r = _login(bystander, "Test12345!")
        assert r.status_code == 200, r.text

    def test_success_clears_prior_failures(self):
        email = f"clr_{_ts()}@example.com"
        _signup(email)
        # 3 wrong
        for _ in range(3):
            r = _login(email, "WrongPass!")
            assert r.status_code == 401
        # 1 correct — must succeed and clear counter
        r_ok = _login(email, "Test12345!")
        assert r_ok.status_code == 200, r_ok.text
        # 3 more wrong — must NOT lock (total counter reset)
        for i in range(3):
            r = _login(email, "WrongPass!")
            assert r.status_code == 401, f"unexpected lock at #{i+1}: {r.status_code} {r.text}"


# ─── (B) PRODUCT OPTIONS ─────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def tenant_a():
    email = f"ta_{_ts()}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/signup", json={
        "email": email, "password": "Test12345!", "name": "Owner A",
        "restaurantName": f"RA{_ts()}", "businessType": "traditional", "lang": "en"
    }, timeout=15)
    assert r.status_code == 201, r.text
    data = r.json()
    return {"token": data["token"], "tenantId": data["tenant"]["id"], "email": email}


@pytest.fixture(scope="module")
def tenant_b():
    email = f"tb_{_ts()}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/signup", json={
        "email": email, "password": "Test12345!", "name": "Owner B",
        "restaurantName": f"RB{_ts()}", "businessType": "traditional", "lang": "en"
    }, timeout=15)
    assert r.status_code == 201, r.text
    data = r.json()
    return {"token": data["token"], "tenantId": data["tenant"]["id"], "email": email}


def _h(tenant):
    return {"Authorization": f"Bearer {tenant['token']}"}


def _category_id(tenant):
    r = requests.get(f"{BASE_URL}/api/categories", headers=_h(tenant), timeout=10)
    assert r.status_code == 200, r.text
    cats = r.json()
    assert len(cats) > 0, "expected seeded categories"
    return cats[0]["id"]


OPTION_GROUPS = [
    {
        "id": "size", "name": "Size", "required": True, "multiSelect": False,
        "items": [
            {"id": "sm", "name": "Small", "priceDelta": 0, "isDefault": True},
            {"id": "lg", "name": "Large", "priceDelta": 10},
        ],
    },
    {
        "id": "addons", "name": "Add-ons", "required": False, "multiSelect": True,
        "items": [
            {"id": "cheese", "name": "Extra Cheese", "priceDelta": 3},
            {"id": "bacon",  "name": "Bacon",        "priceDelta": 5},
        ],
    },
]


class TestProductOptions:

    def test_create_product_with_option_groups(self, tenant_a):
        cat = _category_id(tenant_a)
        r = requests.post(f"{BASE_URL}/api/products", headers=_h(tenant_a), json={
            "name": "Burger", "price": 20, "categoryId": cat,
            "optionGroups": OPTION_GROUPS,
        }, timeout=10)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["price"] == 20
        assert isinstance(body.get("optionGroups"), list)
        assert len(body["optionGroups"]) == 2
        # GET back
        g = requests.get(f"{BASE_URL}/api/products/{body['id']}", headers=_h(tenant_a), timeout=10)
        assert g.status_code == 200
        gb = g.json()
        assert len(gb["optionGroups"]) == 2
        assert gb["optionGroups"][0]["id"] == "size"
        # stash for later
        tenant_a["burgerId"] = body["id"]

    def test_patch_name_only_does_not_drop_option_groups(self, tenant_a):
        pid = tenant_a["burgerId"]
        r = requests.patch(f"{BASE_URL}/api/products/{pid}", headers=_h(tenant_a),
                           json={"name": "Burger Deluxe"}, timeout=10)
        assert r.status_code == 200, r.text
        # Re-fetch and confirm optionGroups still present
        g = requests.get(f"{BASE_URL}/api/products/{pid}", headers=_h(tenant_a), timeout=10).json()
        assert g["name"] == "Burger Deluxe"
        assert isinstance(g["optionGroups"], list) and len(g["optionGroups"]) == 2

    def test_order_unit_price_includes_options(self, tenant_a):
        pid = tenant_a["burgerId"]
        # size=lg (+10), cheese (+3) on base 20 → unit 33
        r = requests.post(f"{BASE_URL}/api/orders", headers=_h(tenant_a), json={
            "type": "dine_in",
            "items": [{
                "productId": pid, "quantity": 1,
                "selectedOptions": [
                    {"groupId": "size", "itemId": "lg"},
                    {"groupId": "addons", "itemId": "cheese"},
                ],
            }],
        }, timeout=10)
        assert r.status_code == 201, r.text
        ord_ = r.json()
        item = ord_["items"][0]
        assert item["unitPrice"] == 33, item
        assert float(item["baseUnitPrice"]) == 20
        assert isinstance(item["selectedOptions"], list)
        assert len(item["selectedOptions"]) == 2
        # 15% inclusive on total 33 → tax 4.30
        assert ord_["total"] == 33
        assert abs(ord_["tax"] - 33 * 15 / 115) < 0.02
        tenant_a["orderId"] = ord_["id"]

    def test_required_option_missing_returns_400(self, tenant_a):
        pid = tenant_a["burgerId"]
        r = requests.post(f"{BASE_URL}/api/orders", headers=_h(tenant_a), json={
            "type": "dine_in",
            "items": [{"productId": pid, "quantity": 1}],  # no selectedOptions
        }, timeout=10)
        assert r.status_code == 400, r.text
        assert "Size" in r.text or "required" in r.text.lower()

    def test_get_order_returns_selected_options_and_base_unit_price(self, tenant_a):
        oid = tenant_a["orderId"]
        r = requests.get(f"{BASE_URL}/api/orders/{oid}", headers=_h(tenant_a), timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        item = body["items"][0]
        assert isinstance(item["selectedOptions"], list) and len(item["selectedOptions"]) == 2
        assert item["baseUnitPrice"] == 20

    def test_simple_product_without_options_still_works(self, tenant_a):
        cat = _category_id(tenant_a)
        c = requests.post(f"{BASE_URL}/api/products", headers=_h(tenant_a), json={
            "name": "Water", "price": 5, "categoryId": cat,
        }, timeout=10)
        assert c.status_code == 201, c.text
        pid = c.json()["id"]
        r = requests.post(f"{BASE_URL}/api/orders", headers=_h(tenant_a), json={
            "type": "dine_in",
            "items": [{"productId": pid, "quantity": 2}],
        }, timeout=10)
        assert r.status_code == 201, r.text
        item = r.json()["items"][0]
        assert item["unitPrice"] == 5
        assert item["selectedOptions"] == []

    def test_tenant_isolation_options_product(self, tenant_a, tenant_b):
        # tenant_b lists products — must NOT see tenant_a's burger
        r = requests.get(f"{BASE_URL}/api/products", headers=_h(tenant_b), timeout=10)
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert tenant_a["burgerId"] not in ids
        # Direct GET by id → 404
        g = requests.get(f"{BASE_URL}/api/products/{tenant_a['burgerId']}",
                         headers=_h(tenant_b), timeout=10)
        assert g.status_code == 404


class TestPublicGuestOrder:
    """Public QR ordering with options."""

    def test_public_order_with_options_and_required_missing(self, tenant_a):
        pid = tenant_a["burgerId"]
        tid = tenant_a["tenantId"]
        # Missing required → 400
        r_bad = requests.post(
            f"{BASE_URL}/api/public/orders?tenantId={tid}",
            json={"tableNumber": "T1",
                  "items": [{"productId": pid, "quantity": 1}]},
            timeout=10)
        assert r_bad.status_code == 400, r_bad.text
        # With option → 201
        r_ok = requests.post(
            f"{BASE_URL}/api/public/orders?tenantId={tid}",
            json={"tableNumber": "T1",
                  "items": [{"productId": pid, "quantity": 1,
                             "selectedOptions": [
                                {"groupId": "size", "itemId": "lg"},
                                {"groupId": "addons", "itemId": "bacon"},
                             ]}]},
            timeout=10)
        assert r_ok.status_code == 201, r_ok.text
        body = r_ok.json()
        # base 20 + 10 + 5 = 35; tax 15% exclusive on public path → tax = 5.25, total = 40.25
        assert abs(body["subtotal"] - 35) < 0.01
        assert abs(body["tax"] - 35 * 0.15) < 0.02
        assert abs(body["total"] - (35 + 35 * 0.15)) < 0.02
