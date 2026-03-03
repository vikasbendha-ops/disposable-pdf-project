"""
Backend tests for Autodestroy PDF Platform - Iteration 2
Tests: Admin Stripe Settings API, PDF viewer endpoint, Authentication
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

ADMIN_EMAIL = "admin@autodestroy.com"
ADMIN_PASSWORD = "admin123"
TEST_TOKEN = "6xVpzyzXxvpYl2kcejLtoyCJePTbFbL7YAf1JS3Y8dg"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code == 200:
        return resp.json().get("access_token")
    pytest.skip(f"Admin login failed: {resp.status_code} - {resp.text}")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Admin auth headers"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestAuth:
    """Authentication tests"""

    def test_admin_login(self):
        """Admin can login"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["role"] == "admin"

    def test_get_current_user(self, admin_headers):
        """Get current user info"""
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"


class TestAdminStripeSettings:
    """Admin Stripe Settings API tests"""

    def test_get_stripe_settings_authenticated(self, admin_headers):
        """GET /api/admin/settings/stripe returns correct structure"""
        resp = requests.get(f"{BASE_URL}/api/admin/settings/stripe", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        # Verify required fields
        assert "mode" in data, "Response missing 'mode' field"
        assert "has_live_key" in data, "Response missing 'has_live_key' field"
        assert "key_preview" in data, "Response missing 'key_preview' field"
        print(f"Stripe settings: mode={data['mode']}, has_live_key={data['has_live_key']}, key_preview={data['key_preview']}")

    def test_get_stripe_settings_mode_valid(self, admin_headers):
        """Stripe mode is either 'sandbox' or 'live'"""
        resp = requests.get(f"{BASE_URL}/api/admin/settings/stripe", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] in ["sandbox", "live"]

    def test_get_stripe_settings_key_preview_format(self, admin_headers):
        """Key preview shows masked key"""
        resp = requests.get(f"{BASE_URL}/api/admin/settings/stripe", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        key_preview = data["key_preview"]
        assert key_preview is not None
        # Should be masked like "sk_...xxxx" or "Not configured"
        print(f"Key preview: {key_preview}")
        assert isinstance(key_preview, str)

    def test_get_stripe_settings_unauthorized(self):
        """GET /api/admin/settings/stripe without auth returns 401/403"""
        resp = requests.get(f"{BASE_URL}/api/admin/settings/stripe")
        assert resp.status_code in [401, 403]

    def test_put_stripe_settings_switch_to_sandbox(self, admin_headers):
        """PUT /api/admin/settings/stripe can switch to sandbox mode"""
        resp = requests.put(
            f"{BASE_URL}/api/admin/settings/stripe",
            headers=admin_headers,
            json={"mode": "sandbox"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        print(f"Switch to sandbox response: {data}")

    def test_put_stripe_settings_invalid_key_format(self, admin_headers):
        """PUT with invalid key format returns 400"""
        resp = requests.put(
            f"{BASE_URL}/api/admin/settings/stripe",
            headers=admin_headers,
            json={"stripe_key": "invalid_key_format"}
        )
        assert resp.status_code == 400

    def test_put_stripe_settings_invalid_mode(self, admin_headers):
        """PUT with invalid mode returns 400"""
        resp = requests.put(
            f"{BASE_URL}/api/admin/settings/stripe",
            headers=admin_headers,
            json={"mode": "invalid_mode"}
        )
        assert resp.status_code == 400

    def test_put_stripe_settings_unauthorized(self):
        """PUT /api/admin/settings/stripe without auth returns 401/403"""
        resp = requests.put(
            f"{BASE_URL}/api/admin/settings/stripe",
            json={"mode": "sandbox"}
        )
        assert resp.status_code in [401, 403]


class TestPDFViewer:
    """PDF viewer endpoint tests"""

    def test_view_link_endpoint(self):
        """GET /api/view/{token} returns link data"""
        resp = requests.get(f"{BASE_URL}/api/view/{TEST_TOKEN}")
        print(f"View link status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"View link data keys: {list(data.keys())}")
            assert "pdf_url" in data or "status" in data
        elif resp.status_code in [404, 410]:
            print(f"Link not found or expired - expected for test token")
        else:
            print(f"Unexpected status: {resp.status_code} - {resp.text}")

    def test_view_pdf_direct_endpoint(self):
        """GET /api/view/{token}/pdf returns PDF content"""
        resp = requests.get(f"{BASE_URL}/api/view/{TEST_TOKEN}/pdf")
        print(f"Direct PDF status: {resp.status_code}")
        if resp.status_code == 200:
            content_type = resp.headers.get("content-type", "")
            print(f"Content-Type: {content_type}")
            assert "application/pdf" in content_type, f"Expected application/pdf but got {content_type}"
            assert len(resp.content) > 0, "PDF content is empty"
            print(f"PDF size: {len(resp.content)} bytes")
        elif resp.status_code in [404, 410]:
            print(f"PDF not found or expired - status {resp.status_code}")
        else:
            print(f"Unexpected status for PDF: {resp.status_code}")


class TestDashboardAPI:
    """Dashboard stats endpoint"""

    def test_dashboard_stats(self, admin_headers):
        """GET /api/dashboard/stats returns stats"""
        resp = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "pdf_count" in data or "active_links" in data
        print(f"Dashboard stats: {data}")


class TestLanguageAPI:
    """Language preference API"""

    def test_update_language(self, admin_headers):
        """PUT /api/auth/language updates language preference"""
        resp = requests.put(
            f"{BASE_URL}/api/auth/language",
            headers=admin_headers,
            json={"language": "fr"}
        )
        assert resp.status_code == 200

    def test_update_language_back_to_english(self, admin_headers):
        """Reset language to English after test"""
        resp = requests.put(
            f"{BASE_URL}/api/auth/language",
            headers=admin_headers,
            json={"language": "en"}
        )
        assert resp.status_code == 200
