import requests

BASE_URL = "http://localhost:3003"
TIMEOUT = 30

def test_site_registration_from_wordpress_plugin():
    url_register = f"{BASE_URL}/api/sites/register-from-wordpress"
    
    # Sample valid registration token, site URL, and API key
    valid_registration_token = "valid_sample_token_123"
    site_url = "https://example-wordpress-site.com"
    api_key = "sample_api_key_456"
    
    headers = {
        "Content-Type": "application/json"
    }
    
    # 1. Test successful registration with valid data
    payload_valid = {
        "registration_token": valid_registration_token,
        "site_url": site_url,
        "api_key": api_key
    }
    try:
        response = requests.post(url_register, json=payload_valid, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed during valid registration attempt: {e}"
    
    assert response.status_code == 201, f"Expected 201 Created for valid registration but got {response.status_code}"
    json_resp = response.json()
    # Check response content: depending on implementation, might return site info or an ID.
    assert isinstance(json_resp, dict), "Response JSON is not a dictionary"
    # Optionally check that site_url and api_key appear in response or that site id is present
    assert "site_url" in json_resp or "id" in json_resp, "Response missing site_url or id"
    
    # 2. Test registration with invalid token
    invalid_payload = {
        "registration_token": "invalid_token_xyz",
        "site_url": "https://example-invalid-site.com",
        "api_key": api_key
    }
    try:
        response_invalid = requests.post(url_register, json=invalid_payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed during invalid registration attempt: {e}"
    
    assert response_invalid.status_code == 400, f"Expected 400 Bad Request for invalid token but got {response_invalid.status_code}"
    json_invalid = response_invalid.json()
    # The error message or code is expected
    assert "error" in json_invalid or "message" in json_invalid, "Error response expected for invalid token registration"

test_site_registration_from_wordpress_plugin()