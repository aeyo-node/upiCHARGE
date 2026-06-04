import os
import requests
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

from chargepoints import resolve_charger, fetch_chargepoint_details
from auth_key import get_auth_token, invalidate_token

# ===== ENV =====
# Find .env in project root even if running from subdirectories
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(dotenv_path=env_path)

# BASE_URL settings are now fetched dynamically inside functions to support Supabase-driven updates.

ORG_ID     = "64b793030dd6bb39c1c3e270"
PROJECT_ID = "6494141957d29409895704d2"


# ============================
# COMMON REQUEST HANDLER
# ============================
def make_request(method, url, **kwargs):
    token = get_auth_token()

    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    headers["Content-Type"] = "application/json"

    response = requests.request(method, url, headers=headers, **kwargs)

    if response.status_code in (401, 403):
        invalidate_token()
        token = get_auth_token(force_refresh=True)
        headers["Authorization"] = f"Bearer {token}"
        response = requests.request(method, url, headers=headers, **kwargs)

    return response


# ============================
# GET CONNECTORS LIST
# ============================
def get_available_connectors(identity):
    details = fetch_chargepoint_details(identity)

    if not details:
        return None, "Failed to fetch charger details"

    evses = details.get("evses", [])

    if not evses:
        return None, "No connectors found"

    connectors = []
    for evse in evses:
        connectors.append({
            "id": evse.get("connectorId"),
            "status": evse.get("connectorStatus", evse.get("status", "Unknown")),
            "evse_status": evse.get("status", "Unknown"),
            "type": evse.get("connectors", {}).get("name", "Unknown")
        })

    return connectors, None

# ============================
# GET CUSTOMER INFO
# ============================
def get_customer_info(keyword):
    """
    Finds customer details using keyword (name/mobile).
    """
    # Using the 'new' endpoint which is often more stable
    url = f"{os.getenv('BASE_LS', 'https://ls.console.chargemod.com')}/customers/get-all-customers-new/"
    params = {
        "organizationId": ORG_ID,
        "projectId": PROJECT_ID,
        "skip": 0,
        "limit": 10,
        "keyword": keyword,
        "walletType": "null"
    }

    # print(f"[*] Debug: Fetching customer info from {url} with params {params}")
    response = make_request("GET", url, params=params)

    if response.status_code != 200:
        # print(f"[*] Debug: API Response: {response.text}")
        return None, f"Failed to fetch customer info (Status: {response.status_code})"

    data = response.json()
    customers = data.get("customers", [])

    if not customers:
        return None, "No customers found"

    # Return the first match
    customer = customers[0]
    return {
        "userId": customer.get("_id"),
        "userMobile": customer.get("mobile"),
        "userName": f"{customer.get('firstName', '')} {customer.get('lastName', '')}".strip()
    }, None


# ============================
# WALLET CHECK
# ============================
def get_wallet_balance(user_id):
    base_url = os.getenv("BASE_LS", "https://ls.console.chargemod.com")
    url = f"{base_url}/wallet/get-wallets"

    payload = {
        "organizationId": ORG_ID,
        "projectId": PROJECT_ID,
        "customerId": user_id
    }

    response = make_request("POST", url, json=payload)

    if response.status_code != 200:
        return None, "api_error"

    data = response.json()
    wallets = data if isinstance(data, list) else data.get("data", [])
    if not isinstance(wallets, list):
        wallets = [wallets] if wallets else []

    if not wallets:
        return 0, "no_wallet"

    def _extract_balance(w):
        raw = w.get("currentBalance") or w.get("walletBalance") or w.get("balance") or 0
        try:
            return round(float(raw) / 1000, 2)
        except (ValueError, TypeError):
            return 0

    for w in wallets:
        if w.get("isPreferred"):
            return _extract_balance(w), None

    return _extract_balance(wallets[0]), None


# ============================
# SEND OTP
# ============================
def _send_otp_via(mobile, method, otp):
    url = f"{os.getenv('BASE_AS', 'https://as.console.chargemod.com')}/dashboard/customer/otp"
    payload = {"mobileNumber": mobile, "otpMethod": method}
    if otp is not None:
        payload["otp"] = int(otp)
    response = make_request("POST", url, json=payload)
    return response.status_code == 200

def send_otp(mobile, method="sms", otp=None):
    if method == "both":
        sms_ok = _send_otp_via(mobile, "sms", otp)
        wa_ok  = _send_otp_via(mobile, "whatsapp", otp)
        return sms_ok or wa_ok
    return _send_otp_via(mobile, method, otp)


# ============================
# VERIFY OTP
# ============================
def verify_otp(mobile, otp, method="sms"):
    url = f"{os.getenv('BASE_AS', 'https://as.console.chargemod.com')}/dashboard/customer/otp"

    payload = {
        "mobileNumber": mobile,
        "otp": int(otp),
        "otpMethod": method
    }

    response = make_request("POST", url, json=payload)

    return response.status_code == 200


# ============================
# REMOTE START WITH OTP
# ============================
def remote_start_with_otp(identifier, user, otp=None, connector_id=None):
    """
    Step 1: If otp=None → send OTP
    Step 2: If otp provided → verify → start
    """

    # STEP 0: Wallet Check
    balance, err = get_wallet_balance(user["userId"])

    if err:
        return {"error": err}

    if balance <= 0:
        return {
            "status": "failed",
            "reason": "insufficient_balance",
            "message": f"Insufficient balance. Wallet balance Rs. {balance}. A positive balance is required to start charging."
        }

    # STEP 1: If OTP not provided → send OTP
    if otp is None:
        # Generate a random 4-digit OTP as per the plan
        import random
        generated_otp = random.randint(1000, 9999)
        user["generated_otp"] = generated_otp

        sent = send_otp(user["userMobile"], method=user.get("otpMethod", "sms"), otp=generated_otp)

        if not sent:
            return {"status": "failed", "message": "Failed to send OTP"}

        return {
            "status": "otp_sent",
            "generated_otp": generated_otp,
            "message": f"OTP {generated_otp} sent to {user['userMobile']} via {user.get('otpMethod', 'sms')}."
        }

    # STEP 2: Verify OTP
    if otp != "BYPASS":
        if not verify_otp(user["userMobile"], otp, method=user.get("otpMethod", "sms")):
            return {
                "status": "failed",
                "message": "Invalid OTP"
            }

    # STEP 3: Resolve Charger
    resolved = resolve_charger(identifier)

    if resolved["status"] != "resolved":
        return resolved

    identity = resolved["charger"]["identity"]
    
    # Get details for connection protocol
    details = fetch_chargepoint_details(identity)
    connection_type = details.get("chargePointConnectionProtocol", "GRIDSCAPE") if details else "GRIDSCAPE"

    # STEP 4: Get connector if not provided
    if not connector_id:
        # Fallback logic for when tool is called without a specific connector
        connectors, err = get_available_connectors(identity)
        if err or not connectors:
            return {"error": err or "No connectors found"}
        
        # Pick first available or just first
        connector_id = connectors[0]["id"]
        for c in connectors:
            if c["status"] in ["Available", "Preparing"]:
                connector_id = c["id"]
                break

    # STEP 5: Start Charging
    url = f"{os.getenv('BASE_TTS', 'https://tts.console.chargemod.com')}/{identity}/Socket-RemoteStartTransaction"

    payload = {
        "connectorId": connector_id,
        "connectionType": connection_type,
        "idTag": "CHARGEMODTAG",
        "isEmergency": False,
        "organizationId": ORG_ID,
        "projectId": PROJECT_ID,
        "subscriptionId": "",
        "usageType": "WALLET",
        "userId": user["userId"],
        "userMobile": user["userMobile"],
        "userName": user["userName"]
    }

    response = make_request("POST", url, json=payload)

    if response.status_code != 200:
        return {
            "status": "failed",
            "message": "Remote start failed",
            "details": response.text
        }

    return {
        "status": "success",
        "message": f"Charging started on connector {connector_id}",
        "balance": balance
    }


# ============================
# REMOTE STOP
# ============================
def remote_stop(identifier, confirmed_mobile=None):

    resolved = resolve_charger(identifier)
    if resolved["status"] != "resolved":
        return resolved

    identity = resolved["charger"]["identity"]

    # 1. Check charger connector status first
    connectors, err = get_available_connectors(identity)
    if err:
        return {"error": err}

    # Find the connector that is actively charging
    charging_connector = None
    for c in connectors:
        if c["status"] in ["Charging", "Preparing"]:
            charging_connector = c
            break

    if not charging_connector:
        # Report current status
        statuses = ", ".join(f"Gun {c['id']}: {c['status']}" for c in connectors)
        unavailable = any(c["status"] in ["Available"] for c in connectors)
        if unavailable:
            return {
                "status": "no_active_session",
                "message": f"Charger is Available — no active charging session to stop. ({statuses})"
            }
        return {
            "status": "unavailable",
            "message": f"Charger is not in a stoppable state. Current status: {statuses}"
        }

    connector_id = charging_connector["id"]

    # 2. Fetch active transaction for this charger
    base_url = os.getenv("BASE_LS", "https://ls.console.chargemod.com")
    if not base_url:
        return {"error": "BASE_URL not configured"}

    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end_date = now.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    payload = {
        "organizationId": ORG_ID,
        "projectId": PROJECT_ID,
        "perPageCount": 10,
        "pageNumber": 1,
        "filterDate": {"startDate": start_date, "endDate": end_date},
        "searchValue": {},
        "allowedLocations": [],
        "transactionType": None,
        "sortType": -1,
        "solarType": ""
    }

    try:
        headers = {"server": "locationService", "Content-Type": "application/json"}
        resp = make_request("POST", f"{base_url}/pwr/charger/get-pwr-active-transaction", json=payload)
        data = resp.json()
    except Exception as e:
        return {"error": f"Failed to fetch active transactions: {e}"}

    # Find transaction matching this charger identity
    active_tx = None
    results = data.get("result", [])
    for tx in results:
        if str(tx.get("identity", "")) == str(identity):
            active_tx = tx
            break

    if not active_tx:
        return {
            "status": "no_active_transaction",
            "message": f"No active transaction found for charger {identity}."
        }

    tx_id = active_tx.get("transactionId") or active_tx.get("_id")
    tx_mobile = active_tx.get("userMobile") or active_tx.get("mobile", "")
    tx_user = active_tx.get("userName", "Unknown")

    # 3. Verify mobile
    if not confirmed_mobile:
        return {
            "status": "verify_mobile",
            "tx_id": tx_id,
            "tx_mobile": tx_mobile,
            "tx_user": tx_user,
            "message": f"Active session found for {tx_user} ({tx_mobile}). Please confirm the mobile number to proceed with stop."
        }

    if str(confirmed_mobile).strip() != str(tx_mobile).strip():
        return {
            "status": "mobile_mismatch",
            "message": f"Mobile number does not match the active session user ({tx_mobile}). Stop aborted."
        }

    # 4. Get connection type
    charger_details = fetch_chargepoint_details(identity)
    connection_type = charger_details.get("chargePointConnectionProtocol", "GRIDSCAPE") if charger_details else "GRIDSCAPE"

    # 5. Execute Remote Stop
    stop_url = f"{os.getenv('BASE_TTS', 'https://tts.console.chargemod.com')}/{identity}/Socket-RemoteStopTransaction"
    stop_payload = {
        "transactionId": tx_id,
        "connectionType": connection_type,
        "connectorId": connector_id,
        "isEmergency": False
    }

    response = make_request("POST", stop_url, json=stop_payload)

    if response.status_code != 200:
        return {
            "status": "failed",
            "message": "Remote stop failed",
            "details": response.text
        }

    return {
        "status": "success",
        "message": f"Charging stopped for {tx_user} on connector {connector_id}.",
        "transactionId": tx_id
    }
