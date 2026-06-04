import sys
import os
import json
from dotenv import load_dotenv

# Ensure we can import from api-call
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
API_CALL_DIR = os.path.join(BASE_DIR, "api-call")
sys.path.append(API_CALL_DIR)

from auth_key import get_auth_token, invalidate_token
from charger_action import charger_action
from RemoteStart import get_customer_info, get_wallet_balance
from chargepoints import fetch_chargepoint_details

def run_test():
    load_dotenv(os.path.join(BASE_DIR, ".env"))
    
    print("=" * 60)
    # Print current environment settings
    from app.config import PAYMENT_MODE
    print(f"upiCHARGE Test Utility")
    print(f"Current Environment PAYMENT_MODE: {PAYMENT_MODE}")
    print("=" * 60)
    
    # 1. Fetch input
    charger_id = input("Enter Charger ID (default: 185599798823820): ").strip() or "185599798823820"
    connector_id_str = input("Enter Connector ID (default: 1): ").strip() or "1"
    connector_id = int(connector_id_str)
    customer_mobile = input("Enter Customer Mobile Number: ").strip()
    
    if not customer_mobile:
        print("❌ Error: Customer mobile number is required.")
        return
        
    print("\n--- Step 1: Invalidate and Refresh Token ---")
    invalidate_token()
    token = get_auth_token(force_refresh=True)
    if token:
        print(f"✅ Auth token obtained successfully. Preview: {token[:20]}...")
    else:
        print("❌ Error: Failed to obtain auth token.")
        return
        
    print("\n--- Step 2: Fetch Charger Details ---")
    details = fetch_chargepoint_details(charger_id)
    if details:
        print(f"✅ Charger Name: {details.get('chargerName')}")
        print(f"✅ Available: {details.get('available')}")
        print("Connectors Status:")
        for evse in details.get("evses", []):
            print(f"  - Gun {evse.get('connectorId')}: status={evse.get('connectorStatus')}, reference={evse.get('physicalReference')}")
    else:
        print("❌ Error: Failed to fetch charger details.")
        return

    print("\n--- Step 3: Check Customer Profile ---")
    user, err = get_customer_info(customer_mobile)
    if err:
        print(f"❌ Customer lookup error: {err}")
    elif user:
        print(f"✅ User found: {user['userName']} (ID: {user['userId']})")
        balance, w_err = get_wallet_balance(user["userId"])
        if w_err:
            print(f"❌ Wallet balance error: {w_err}")
        else:
            print(f"✅ Wallet balance: Rs. {balance}")
    else:
        print("❌ Customer not found on chargeMOD system.")

    print("\n--- Step 4: Execute charger_action(action='start') ---")
    print(f"Starting action with charger_identity='{charger_id}', customer_mobile='{customer_mobile}', connector_id={connector_id}...")
    try:
        res = charger_action(
            action="start",
            charger_identity=charger_id,
            customer_mobile=customer_mobile,
            connector_id=connector_id,
            otp_method="skip"
        )
        print(f"\nResult from charger_action:")
        print(json.dumps(res, indent=2))
        
        if res.get("status") == "success":
            print("\n🎉 SUCCESS: Start command executed successfully!")
        else:
            print("\n❌ FAILURE: Start command failed.")
    except Exception as e:
        import traceback
        print(f"\n💥 CRITICAL EXCEPTION raised during execution:")
        traceback.print_exc()

if __name__ == "__main__":
    run_test()
