import requests
import uuid

BASE_URL = "http://localhost:3003"
TIMEOUT = 30

# Replace these with valid test user credentials
TEST_USERNAME = f"testuser_{uuid.uuid4().hex[:8]}"
TEST_EMAIL = f"{TEST_USERNAME}@example.com"
TEST_PASSWORD = "TestPass123!"

def test_update_user_profile():
    session = requests.Session()
    try:
        # Register a new user
        register_payload = {
            "username": TEST_USERNAME,
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        }
        register_resp = session.post(f"{BASE_URL}/api/auth/register", json=register_payload, timeout=TIMEOUT)
        assert register_resp.status_code == 201, f"User registration failed: {register_resp.text}"

        # Normally email verification token would be sent by email, 
        # but since no details provided, try to login directly. If verification required, login will fail.
        # So, skip verification step unless API allows. We'll attempt login, expecting 200 or 401.
        login_payload = {
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        }
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("token")
        assert token, "JWT token not found in login response"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # Get current profile to compare later
        profile_resp = session.get(f"{BASE_URL}/api/users/profile", headers=headers, timeout=TIMEOUT)
        assert profile_resp.status_code == 200, f"Get profile failed: {profile_resp.text}"
        profile_before = profile_resp.json()
        assert "email" in profile_before and ("display_name" in profile_before or True)  # Optional field 'display_name'

        # Prepare new profile data to update
        new_email = f"updated_{TEST_USERNAME}@example.com"
        new_display_name = f"DisplayName_{uuid.uuid4().hex[:6]}"
        update_payload = {
            "email": new_email,
            "display_name": new_display_name
        }

        # Send PATCH request to update profile
        update_resp = session.patch(f"{BASE_URL}/api/users/profile", headers=headers, json=update_payload, timeout=TIMEOUT)
        assert update_resp.status_code == 200, f"Profile update failed: {update_resp.text}"
        updated_profile = update_resp.json()

        # Validate updated fields in response
        assert updated_profile.get("email") == new_email, f"Email not updated correctly: {updated_profile.get('email')}"
        assert updated_profile.get("display_name") == new_display_name, f"Display name not updated correctly: {updated_profile.get('display_name')}"

        # Retrieve profile again to ensure update persisted
        profile_after_resp = session.get(f"{BASE_URL}/api/users/profile", headers=headers, timeout=TIMEOUT)
        assert profile_after_resp.status_code == 200, f"Get profile after update failed: {profile_after_resp.text}"
        profile_after = profile_after_resp.json()

        # Confirm updated fields match
        assert profile_after.get("email") == new_email, "Updated email not persisted"
        assert profile_after.get("display_name") == new_display_name, "Updated display name not persisted"

        # Test data validation: try updating with invalid email format
        invalid_update_payload = {
            "email": "invalid-email-format",
        }
        invalid_resp = session.patch(f"{BASE_URL}/api/users/profile", headers=headers, json=invalid_update_payload, timeout=TIMEOUT)
        # The specification does not detail error code for validation error here,
        # assume 400 Bad Request for invalid data
        assert invalid_resp.status_code == 400 or invalid_resp.status_code == 422, f"Invalid email format accepted: {invalid_resp.text}"

        # Test unauthorized access: try update without auth header
        unauth_resp = session.patch(f"{BASE_URL}/api/users/profile", json=update_payload, timeout=TIMEOUT)
        assert unauth_resp.status_code == 401, f"Unauthorized update allowed: {unauth_resp.text}"

    finally:
        # Cleanup: delete the test user if API supports it
        # No user delete endpoint specified in PRD; skip deletion
        session.close()

test_update_user_profile()
