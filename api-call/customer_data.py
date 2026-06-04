import os
import requests
import json
from dotenv import load_dotenv
import sys
from datetime import datetime
import zoneinfo
IST = zoneinfo.ZoneInfo("Asia/Kolkata")



def convert_to_ist(val):
    """Helper to convert UTC ISO strings to IST readable strings."""
    if not isinstance(val, str) or not (val.endswith('Z') or '+00:00' in val):
        return val
    try:
        clean_val = val.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_val)
        return dt.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S")
    except:
        return val

DATE_FIELDS = {"createdAt", "updatedAt", "lastLogin", "date", "paymentDate"}

# Append parent directory to path to import auth_key
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from auth_key import get_auth_token, invalidate_token

load_dotenv()

# ==============================================================================
# AUTH-AWARE REQUEST HELPER
# Sends the API call with the cached token. If a 401 (token expired) is returned,
# it force-refreshes the token via get_auth_token(force_refresh=True) and retries
# the request exactly once with the new token.
# ==============================================================================
def make_api_request(method, url, **kwargs):
    """
    Wrapper around requests that handles 401 token expiry automatically.

    Flow:
        make_api_request() sends the API call with cached token
            ↓
        API returns 401 (token expired)
            ↓
        get_auth_token(force_refresh=True) → hits ds-signin API → gets new token
            ↓
        token_cache.json updated with new token + new expires_at
            ↓
        Request retried automatically with new token ✅
    """
    token = get_auth_token()
    if not token:
        raise RuntimeError("Unable to obtain auth token.")

    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"

    response = requests.request(method, url, headers=headers, **kwargs)

    if response.status_code in (401, 403):
        print(f"[make_api_request] {response.status_code} — token expired. Invalidating cache and refreshing...")
        invalidate_token()
        new_token = get_auth_token(force_refresh=True)
        if not new_token:
            raise RuntimeError(f"Token refresh failed after {response.status_code}.")
        headers["Authorization"] = f"Bearer {new_token}"
        response = requests.request(method, url, headers=headers, **kwargs)

    return response

# ==============================================================================
# CONFIGURATION: Data Filtering
# You can manually modify this list to remove unwanted fields from the raw JSON
# ==============================================================================
KEYS_TO_REMOVE = [
    "__v", "updatedAt", "makePookalam",
    "organizationId", "projectId", "fcmToken", "token_v",
    "refreshToken", "isPasswordEnabled",
    "isMailAllowed", "isMailVerified", "deviceModel",
    "userProfile", "typeImage", "description",
    "gstin", "status","userType","rewardKwh"
]

def filter_noise(data, keys_to_remove):
    """
    Recursively removes unwanted keys from the output data and converts UTC dates to IST.
    """
    if isinstance(data, dict):
        new_d = {}
        for k, v in data.items():
            if k in keys_to_remove:
                continue
            
            # Recurse and convert
            val = filter_noise(v, keys_to_remove)
            if k in DATE_FIELDS:
                val = convert_to_ist(val)
                
            new_d[k] = val
        return new_d
    elif isinstance(data, list):
        return [filter_noise(item, keys_to_remove) for item in data]
    return data

def fetch_customer_details(keyword, organization_id="64b793030dd6bb39c1c3e270", project_id="6494141957d29409895704d2"):
    """
    Fetches customer and wallet details using a search keyword (e.g., mobile number).
    Cleans the payload and saves it dynamically to data/customers/.
    """
    base_url = os.getenv("BASE_URL")
    if not base_url:
        print("Error: BASE_URL environment variable is missing.")
        return None, None

    headers = {
        "server": "locationService",
        "Content-Type": "application/json"
    }

    # 1. Fetch Customer Profile
    customer_api = f"{base_url}/customers/get-all-customers-new/"
    params = {
        "skip": 0,
        "limit": 10,
        "organizationId": organization_id,
        "projectId": project_id,
        "walletType": "null",
        "keyword": keyword,
    }

    try:
        response = make_api_request("GET", customer_api, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        customer_payload = response.json()
        
        customers = customer_payload.get("customers", [])
        if not customers:
            print(f"No customers found for keyword: {keyword}")
            return None, None
        
        target_customer = customers[0]
        customer_id = target_customer.get("_id")
        if "_id" in target_customer:
            target_customer["customer_id"] = target_customer.pop("_id")
    except requests.exceptions.RequestException as e:
        print(f"API Request Failed (Customer): {str(e)}")
        return None, None

    raw_result = {
        "customer": target_customer
    }

    # Filter out noise
    clean_data = filter_noise(raw_result, set(KEYS_TO_REMOVE))

    # Save mapping
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'customers'))
    os.makedirs(data_dir, exist_ok=True)
    file_path = os.path.join(data_dir, f"customer_{keyword}.json")
    
    with open(file_path, "w") as f:
        json.dump(clean_data, f, indent=2)
        
    print(f"Successfully saved cleanly formatted customer data to {file_path}")
    return clean_data, customer_id

