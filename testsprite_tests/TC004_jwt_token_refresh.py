import requests

BASE_URL = "http://localhost:3003"
TIMEOUT = 30

def test_jwt_token_refresh():
    # First, register a new user to obtain initial tokens (access and refresh)
    register_url = f"{BASE_URL}/api/auth/register"
    login_url = f"{BASE_URL}/api/auth/login"
    refresh_url = f"{BASE_URL}/api/auth/refresh"

    user_data = {
        "username": "testuser_jwt_refresh",
        "email": "testuser_jwt_refresh@example.com",
        "password": "TestPass123!"
    }

    # Register user
    try:
        r = requests.post(register_url, json=user_data, timeout=TIMEOUT)
        assert r.status_code == 201 or r.status_code == 400, f"Unexpected status code on register: {r.status_code}"
        # If 201, registration successful; if 400, user may already exist
    except requests.RequestException as e:
        assert False, f"Registration request failed: {e}"

    # Login user to get access token and refresh token
    login_data = {
        "username": user_data["username"],
        "password": user_data["password"]
    }

    try:
        r = requests.post(login_url, json=login_data, timeout=TIMEOUT)
        if r.status_code == 401:
            assert False, "Login failed with 401 Unauthorized. User may not be verified. Cannot proceed with token refresh test."
        assert r.status_code == 200, f"Login failed with status code {r.status_code}"
        login_resp = r.json()
        # Expect JWT token (assume "accessToken" and "refreshToken" keys or "token" and "refreshToken")
        assert "refreshToken" in login_resp or "refresh_token" in login_resp or "token" in login_resp, "No token found in login response"
        # Extract refresh token
        refresh_token = None
        if "refreshToken" in login_resp:
            refresh_token = login_resp["refreshToken"]
        elif "refresh_token" in login_resp:
            refresh_token = login_resp["refresh_token"]
        elif "token" in login_resp:
            # If only access token provided, we cannot test refresh, skip test
            assert False, "No refresh token provided in login response"
        else:
            assert False, "Refresh token not found in login response"
    except requests.RequestException as e:
        assert False, f"Login request failed: {e}"

    headers = {"Content-Type": "application/json"}

    # Test refreshing JWT token with valid refresh token
    try:
        payload = {"refreshToken": refresh_token}
        r = requests.post(refresh_url, json=payload, headers=headers, timeout=TIMEOUT)
        assert r.status_code == 200, f"Valid refresh token request failed with status {r.status_code}"
        resp_json = r.json()
        assert isinstance(resp_json, dict), "Refresh response is not a JSON object"
        assert any(k in resp_json for k in ["accessToken", "token"]), "New access token not found in refresh response"
    except requests.RequestException as e:
        assert False, f"Refresh request failed: {e}"

    # Test refreshing JWT token with invalid/expired token
    try:
        invalid_payload = {"refreshToken": "invalid_or_expired_refresh_token_value"}
        r = requests.post(refresh_url, json=invalid_payload, headers=headers, timeout=TIMEOUT)
        assert r.status_code == 401, f"Invalid refresh token should return 401, got {r.status_code}"
    except requests.RequestException as e:
        assert False, f"Invalid refresh request failed: {e}"

test_jwt_token_refresh()
