import requests

BASE_URL = "http://localhost:3003"
TIMEOUT = 30

def test_get_current_user_profile():
    # First, login to get a valid JWT token for authorization
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {
        "username": "testuser",
        "password": "TestPassword123!"
    }
    try:
        login_response = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_response.status_code == 200, f"Login failed with status code {login_response.status_code}"
        login_data = login_response.json()
        token = login_data.get("token") or login_data.get("accessToken")  # Accept common keys
        assert token is not None, "JWT token not found in login response"
    except requests.RequestException as e:
        assert False, f"Login request failed: {str(e)}"

    # Use the JWT token to get the current user profile
    profile_url = f"{BASE_URL}/api/users/profile"
    headers = {
        "Authorization": f"Bearer {token}"
    }
    try:
        profile_response = requests.get(profile_url, headers=headers, timeout=TIMEOUT)
        assert profile_response.status_code == 200, f"Failed to get user profile, status code {profile_response.status_code}"
        profile_data = profile_response.json()
        assert isinstance(profile_data, dict), "Profile response is not a JSON object"
        # Validate expected fields are present (typical user profile fields)
        expected_fields = ["username", "email"]
        missing_fields = [field for field in expected_fields if field not in profile_data]
        assert not missing_fields, f"Missing fields in profile response: {missing_fields}"
    except requests.RequestException as e:
        assert False, f"Profile request failed: {str(e)}"

test_get_current_user_profile()