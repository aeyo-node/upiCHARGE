import requests
import json
import os
from dotenv import load_dotenv

# Load .env
load_dotenv()

# ===== CONFIG =====
# USER_EMAIL and USER_PASSWORD will be read from environment at runtime to support dynamic updates.

import time
import os

# Use /data volume if available (Docker), otherwise use local data/ folder
if os.path.exists("/data"):
    TOKEN_FILE = "/data/token_cache.json"
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR = os.path.join(BASE_DIR, "data")
    os.makedirs(DATA_DIR, exist_ok=True)
    TOKEN_FILE = os.path.join(DATA_DIR, "token_cache.json")


def invalidate_token():
    """Delete the cached token so the next call forces a fresh login."""
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)
        print("[auth] Token cache invalidated.")

def get_auth_token(email=None, password=None, force_refresh=False):
    # Fetch from environment if not provided explicitly
    email = email or os.getenv("USER_EMAIL")
    password = password or os.getenv("USER_PASSWORD")
    
    if not email or not password:
        print("[auth] WARNING: USER_EMAIL or USER_PASSWORD not set in environment.")
    
    if not force_refresh and os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, "r") as f:
                cache = json.load(f)
                token = cache.get("token")
                expires_at = cache.get("expires_at", 0)
                
                if token and time.time() < (expires_at - 300):
                    print("Using cached token.")
                    return token
                else:
                    print("Cached token has expired or is near expiration. Refreshing...")
        except Exception as e:
            print(f"Error reading token cache ({e}). Proceeding to fetch new token.")

    print("Fetching new token from ds-signin...")
    # 2. Fetch new token
    url = "https://ogs.console.chargemod.com/web/register/ds-signin"
    
    payload = {
        "email": email,
        "password": password
    }
    
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    try:
        response = requests.post(url, json=payload, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            # Try multiple common paths for the token depending on precise API structure
            token = data.get("token") or data.get("accessToken") or data.get("data", {}).get("accessToken") or data.get("data", {}).get("token")
            
            if token:
                # Token is valid for 2 days. Cache it with a duration (e.g. 47 hours, to be safe)
                expires_at = time.time() + (47 * 3600)
                try:
                    with open(TOKEN_FILE, "w") as f:
                        json.dump({"token": token, "expires_at": expires_at}, f)
                    print("Login Successful and Token Cached!")
                except Exception as e:
                    print("Error saving token cache:", e)
                return token
            else:
                print("Failed to find token in response data:", data)
                return None
        else:
            print(f"Failed to login. Status Code: {response.status_code}")
            print(f"Response: {response.text}")
            return None

    except Exception as e:
        print(f"An error occurred: {e}")
        return None

# Usage
if __name__ == "__main__":
    auth_token = get_auth_token()
    if auth_token:
        print(f"Your Token (first 20 chars): {auth_token[:20]}...")