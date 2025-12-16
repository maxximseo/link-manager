import requests
import datetime

BASE_URL = "http://localhost:3003"
TIMEOUT = 30

# These credentials should be valid in the system or replaced accordingly
TEST_USERNAME = "testuser_tc010"
TEST_EMAIL = "testuser_tc010@example.com"
TEST_PASSWORD = "TestPassword123!"

def test_purchase_placement_with_billing():
    session = requests.Session()
    headers = {"Content-Type": "application/json"}
    auth_token = None
    project_id = None
    site_id = None
    link_id = None  # or article_id depending on type

    try:
        # 1. Register user
        register_payload = {
            "username": TEST_USERNAME,
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        }
        resp = session.post(f"{BASE_URL}/api/auth/register", json=register_payload, timeout=TIMEOUT, headers=headers)
        assert resp.status_code == 201, f"User registration failed: {resp.text}"

        # 2. Login user to get JWT token
        login_payload = {
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        }
        resp = session.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=TIMEOUT, headers=headers)
        assert resp.status_code == 200, f"User login failed: {resp.text}"
        token = resp.json().get("token") or resp.json().get("accessToken")  # based on implementation naming
        assert token, "No token received on login"
        auth_token = token

        auth_headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }

        # 3. Create project
        project_payload = {
            "name": "Test Project for TC010",
            "description": "Project created for testing purchase placement."
        }
        resp = session.post(f"{BASE_URL}/api/projects", json=project_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 201, f"Project creation failed: {resp.text}"
        project = resp.json()
        project_id = project.get("id") or project.get("projectId")
        assert project_id is not None, "Project ID missing after creation"

        # 4. Create site
        site_payload = {
            "site_url": "http://example-tc010-site.com",
            "site_type": "wordpress"
        }
        resp = session.post(f"{BASE_URL}/api/sites", json=site_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 201, f"Site creation failed: {resp.text}"
        site = resp.json()
        site_id = site.get("id")
        assert site_id is not None, "Site ID missing after creation"

        # 5. Add link (content) to project to have contentIds for purchase
        link_payload = {
            "anchor_text": "Test Anchor for TC010",
            "url": "http://example-tc010-link.com"
        }
        resp = session.post(f"{BASE_URL}/api/projects/{project_id}/links", json=link_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 201, f"Adding link failed: {resp.text}"
        link = resp.json()
        link_id = link.get("id") or link.get("linkId")
        assert link_id is not None, "Link ID missing after creation"

        # 6. Deposit sufficient balance to user account to cover purchase
        deposit_payload = {
            "amount": 100.0,
            "description": "Deposit for placement purchase testing"
        }
        resp = session.post(f"{BASE_URL}/api/billing/deposit", json=deposit_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Deposit failed: {resp.text}"

        # 7. Get balance and assert sufficient balance > 0
        resp = session.get(f"{BASE_URL}/api/billing/balance", headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Get balance failed: {resp.text}"
        balance_info = resp.json()
        balance = balance_info.get("balance")
        assert balance is not None and balance > 0, "Insufficient balance for purchase test"

        # 8. Prepare purchase payload with scheduling and autoRenewal
        scheduled_date_iso = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).isoformat() + "Z"
        purchase_payload = {
            "projectId": project_id,
            "siteId": site_id,
            "type": "link",
            "contentIds": [link_id],
            "scheduledDate": scheduled_date_iso,
            "autoRenewal": True
        }
        resp = session.post(f"{BASE_URL}/api/billing/purchase", json=purchase_payload, headers=auth_headers, timeout=TIMEOUT)

        # 9. Validate purchase
        if resp.status_code == 200:
            purchase_resp = resp.json()
            assert "placementId" in purchase_resp or "id" in purchase_resp, "Purchase response missing placementId"
        elif resp.status_code == 400:
            # Could be insufficient balance, fail accordingly
            error_msg = resp.json().get("message", resp.text)
            assert False, f"Purchase failed with 400 error: {error_msg}"
        else:
            assert False, f"Unexpected status code on purchase: {resp.status_code} - {resp.text}"

    finally:
        # Cleanup: Delete created link, project, site to maintain test isolation
        if auth_token:
            auth_headers = {
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            }
            if link_id and project_id:
                try:
                    session.delete(f"{BASE_URL}/api/projects/{project_id}/links/{link_id}", headers=auth_headers, timeout=TIMEOUT)
                except Exception:
                    pass
            if project_id:
                try:
                    session.delete(f"{BASE_URL}/api/projects/{project_id}", headers=auth_headers, timeout=TIMEOUT)
                except Exception:
                    pass
            if site_id:
                try:
                    session.delete(f"{BASE_URL}/api/sites/{site_id}", headers=auth_headers, timeout=TIMEOUT)
                except Exception:
                    pass
            # Optionally delete user if API exists (not specified)

test_purchase_placement_with_billing()