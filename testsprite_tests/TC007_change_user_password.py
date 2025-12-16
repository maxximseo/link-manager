import requests

BASE_URL = "http://localhost:3003"
TIMEOUT = 30

def test_change_user_password():
    # Credentials for test user
    test_username = "testuser_tc007"
    test_email = "testuser_tc007@example.com"
    initial_password = "InitialPass123!"
    new_password = "NewPass123!"
    
    headers = {
        "Content-Type": "application/json"
    }
    
    # Register the test user
    register_payload = {
        "username": test_username,
        "email": test_email,
        "password": initial_password
    }

    try:
        reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json=register_payload, headers=headers, timeout=TIMEOUT)
        assert reg_resp.status_code == 201, f"Registration failed: {reg_resp.status_code} {reg_resp.text}"

        # Normally, email verification is required, but no email token provided in test plan or instructions
        # Attempting login directly to get token (assuming no email verification enforced for test or backend auto-verifies)
        login_payload = {
            "username": test_username,
            "password": initial_password
        }
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload, headers=headers, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} {login_resp.text}"
        auth_token = login_resp.json().get("token")
        assert auth_token, "No auth token received after login"

        auth_headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }

        # Test changing password with correct current password
        change_pass_payload = {
            "currentPassword": initial_password,
            "newPassword": new_password
        }
        change_pass_resp = requests.post(f"{BASE_URL}/api/users/change-password", json=change_pass_payload, headers=auth_headers, timeout=TIMEOUT)
        assert change_pass_resp.status_code == 200, f"Password change failed (correct current password): {change_pass_resp.status_code} {change_pass_resp.text}"

        # Verify login with new password now works
        login_new_payload = {
            "username": test_username,
            "password": new_password
        }
        login_new_resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_new_payload, headers=headers, timeout=TIMEOUT)
        assert login_new_resp.status_code == 200, f"Login failed with new password: {login_new_resp.status_code} {login_new_resp.text}"

        # Test changing password with incorrect current password
        change_pass_bad_payload = {
            "currentPassword": "WrongPass123!",
            "newPassword": "DoesNotMatter123!"
        }
        change_pass_bad_resp = requests.post(f"{BASE_URL}/api/users/change-password", json=change_pass_bad_payload, headers=auth_headers, timeout=TIMEOUT)
        assert change_pass_bad_resp.status_code == 400, f"Password change succeeded with wrong current password: {change_pass_bad_resp.status_code} {change_pass_bad_resp.text}"

    finally:
        # Cleanup: Delete the created user if possible
        # No direct API described for deleting user, attempt via profile patch or assume test environment handles cleanup
        # If deletion API existed, a cleanup call would be here.
        pass

test_change_user_password()
