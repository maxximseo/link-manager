import requests
import time

BASE_URL = "http://localhost:3003"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
TIMEOUT = 30

def test_user_login_functionality():
    headers = {"Content-Type": "application/json"}

    # Define valid credentials (these should exist in system for the test)
    valid_username = "testuser"
    valid_password = "testpassword123"

    # 1. Test successful login with valid credentials
    login_payload = {
        "username": valid_username,
        "password": valid_password
    }
    response = requests.post(LOGIN_URL, json=login_payload, headers=headers, timeout=TIMEOUT)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    response_json = response.json()
    assert "token" in response_json or "accessToken" in response_json, "JWT token not returned on successful login"

    # 2. Test login with invalid credentials - invalid password
    invalid_payload = {
        "username": valid_username,
        "password": "wrongpassword"
    }
    response_invalid = requests.post(LOGIN_URL, json=invalid_payload, headers=headers, timeout=TIMEOUT)
    assert response_invalid.status_code == 401, f"Expected 401 Unauthorized for invalid password, got {response_invalid.status_code}"

    # 3. Test rate limiting enforcement
    # Make multiple rapid requests with invalid credentials to trigger rate limiting
    max_attempts = 10  # Reasonable high attempts to trigger rate limit
    rate_limited = False
    for _ in range(max_attempts):
        resp = requests.post(LOGIN_URL, json=invalid_payload, headers=headers, timeout=TIMEOUT)
        if resp.status_code == 429:
            rate_limited = True
            break
        # Slight delay to not immediately hammer server too fast
        time.sleep(0.1)

    assert rate_limited, "Rate limit not enforced after multiple invalid login attempts"

test_user_login_functionality()