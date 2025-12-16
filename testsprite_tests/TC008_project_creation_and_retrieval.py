import requests

BASE_URL = "http://localhost:3003"
TIMEOUT = 30

# Replace these with valid credentials for an existing user to authenticate and get JWT token
TEST_USERNAME = "testuser"
TEST_PASSWORD = "testpassword"

def test_project_creation_and_retrieval():
    # Authenticate user to get JWT token
    auth_url = f"{BASE_URL}/api/auth/login"
    auth_payload = {
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD
    }
    try:
        auth_response = requests.post(auth_url, json=auth_payload, timeout=TIMEOUT)
        assert auth_response.status_code == 200, f"Login failed with status {auth_response.status_code}"
        auth_data = auth_response.json()
        token = auth_data.get("token")
        assert token is not None, "JWT token not found in login response"
    except Exception as e:
        raise AssertionError(f"Authentication failed: {e}")

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    created_project_id = None
    try:
        # Create a new project with required fields (name)
        create_project_url = f"{BASE_URL}/api/projects"
        project_payload = {
            "name": "Test Project via API",
            "description": "Test project created during automated testing."
        }
        create_response = requests.post(create_project_url, json=project_payload, headers=headers, timeout=TIMEOUT)
        assert create_response.status_code == 201, f"Project creation failed with status {create_response.status_code}"
        project_data = create_response.json()
        created_project_id = project_data.get("id") or project_data.get("projectId") or project_data.get("project_id")
        assert created_project_id is not None, "Created project ID not found in response"

        # Retrieve all projects for authenticated user
        get_projects_url = f"{BASE_URL}/api/projects"
        get_response = requests.get(get_projects_url, headers=headers, timeout=TIMEOUT)
        assert get_response.status_code == 200, f"Getting projects failed with status {get_response.status_code}"
        projects_list = get_response.json()
        assert isinstance(projects_list, list), "Projects list response is not a list"

        # Verify the created project is in the list of projects
        project_ids = [proj.get("id") for proj in projects_list if isinstance(proj, dict)]
        assert created_project_id in project_ids, "Created project is not found in the projects list"

    finally:
        # Cleanup: Delete the created project to maintain test isolation
        if created_project_id:
            delete_project_url = f"{BASE_URL}/api/projects/{created_project_id}"
            try:
                del_response = requests.delete(delete_project_url, headers=headers, timeout=TIMEOUT)
                assert del_response.status_code == 200, f"Deleting project failed with status {del_response.status_code}"
            except Exception as e:
                # Log or raise error depending on environment
                raise AssertionError(f"Cleanup failed: could not delete project {created_project_id} - {e}")

test_project_creation_and_retrieval()