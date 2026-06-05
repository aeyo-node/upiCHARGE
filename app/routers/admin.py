import os
import sys
import json
import requests
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import razorpay

# Ensure api-call directory is on the path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
API_CALL_DIR = os.path.join(BASE_DIR, "api-call")
if API_CALL_DIR not in sys.path:
    sys.path.append(API_CALL_DIR)

from charger_action import charger_action
from app.config import get_payment_mode, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
from app.routers.payments import upsert_transaction

router = APIRouter(prefix="/api/admin", tags=["admin"])

# --- Request Payloads ---

class RefundPayload(BaseModel):
    payment_id: str
    amount: float

class RemoteStartPayload(BaseModel):
    charger_id: str
    connector_id: int
    prepaid_amount: float = 100.0

class RemoteStopPayload(BaseModel):
    charger_id: str

class ConfigPayload(BaseModel):
    payment_mode: str


# --- Helper Function ---

def get_transactions_db() -> list:
    filepath = os.path.join(BASE_DIR, "data", "transactions_db.json")
    if os.path.exists(filepath):
        try:
            with open(filepath, "r") as f:
                return json.load(f)
        except Exception:
            return []
    return []


# --- API Endpoints ---

@router.get("/transactions")
def list_transactions():
    """
    Returns all transactions logged in our local transaction database, sorted newest first.
    """
    db = get_transactions_db()
    # Sort by created_at descending
    db.sort(key=lambda x: r.get("created_at") if (r := x) else "", reverse=True)
    return db

@router.post("/refund")
def process_manual_refund(payload: RefundPayload):
    """
    Manually triggers an instant Razorpay refund for a captured payment.
    """
    payment_id = payload.payment_id.strip()
    refund_amount = payload.amount
    
    if refund_amount <= 0:
        raise HTTPException(status_code=400, detail="Refund amount must be greater than 0")

    refund_status = "simulated"
    refund_id = None
    msg = ""

    if get_payment_mode() == "live" and RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
        try:
            client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
            refund_amount_paise = int(round(refund_amount * 100))
            
            refund_data = {
                "amount": refund_amount_paise,
                "speed": "optimum",
                "notes": {
                    "reason": f"Manual administrative refund via Admin Panel"
                }
            }
            
            refund_res = client.payment.refund(payment_id, refund_data)
            refund_id = refund_res.get("id")
            refund_status = f"refunded_via_razorpay: {refund_id}"
            msg = f"Razorpay refund {refund_id} processed successfully."
        except Exception as e:
            print(f"[Admin Refund Error] Razorpay refund failed for {payment_id}: {e}")
            raise HTTPException(status_code=400, detail=f"Razorpay refund failed: {str(e)}")
    else:
        refund_id = f"ref_sim_{int(datetime.now(timezone.utc).timestamp())}"
        refund_status = "simulated_success"
        msg = f"Simulated refund {refund_id} processed successfully."

    # Update database record using upsert helper
    upsert_transaction(
        payment_id=payment_id,
        refund_status=refund_status,
        refund_amount=refund_amount,
        refund_id=refund_id,
        refunded_at=datetime.now(timezone.utc).isoformat()
    )

    return {
        "status": "success",
        "payment_id": payment_id,
        "refund_id": refund_id,
        "refund_status": refund_status,
        "message": msg
    }

@router.get("/active-sessions")
def get_active_sessions():
    """
    Returns active payments and current simulated or physical sessions from the server.
    """
    # 1. Fetch active simulation session
    sim_session = None
    sim_path = os.path.join(BASE_DIR, "data", "active_simulation_session.json")
    if os.path.exists(sim_path):
        try:
            with open(sim_path, "r") as f:
                sim_session = json.load(f)
        except Exception:
            pass

    # 2. Fetch active payments
    active_payments = {}
    active_path = os.path.join(BASE_DIR, "data", "active_payments.json")
    if os.path.exists(active_path):
        try:
            with open(active_path, "r") as f:
                active_payments = json.load(f)
        except Exception:
            pass

    return {
        "payment_mode": get_payment_mode(),
        "active_simulation_session": sim_session,
        "active_payments": active_payments
    }

@router.post("/remote-start")
def admin_remote_start(payload: RemoteStartPayload):
    """
    Triggers direct charger start using the socket OCPP-level start with the skip OTP mode.
    """
    print(f"[Admin Remote Start] Direct trigger: Charger {payload.charger_id}, Conn {payload.connector_id}")
    
    # Trigger actual action
    res = charger_action(
        action="start",
        charger_identity=payload.charger_id,
        customer_mobile="9999999999",
        connector_id=payload.connector_id,
        otp_method="skip"
    )

    if "error" in res or res.get("status") != "success":
        if get_payment_mode() == "dummy":
            # Simulate start success in dummy mode
            res = {
                "status": "success",
                "message": "Direct simulated start completed successfully."
            }
        else:
            raise HTTPException(status_code=400, detail=res.get("error") or "Remote start failed")

    # In dummy mode, save simulation session as well
    if get_payment_mode() == "dummy":
        sim_path = os.path.join(BASE_DIR, "data", "active_simulation_session.json")
        session_info = {
            "charger_id": payload.charger_id,
            "connector_id": payload.connector_id,
            "customer_mobile": "9999999999",
            "prepaid_amount": payload.prepaid_amount,
            "start_time": datetime.now(timezone.utc).isoformat()
        }
        with open(sim_path, "w") as f:
            json.dump(session_info, f, indent=2)
            
        upsert_transaction(
            charger_id=payload.charger_id,
            status="captured",
            captured_at=datetime.now(timezone.utc).isoformat(),
            charging_status="charging",
            charging_start_time=datetime.now(timezone.utc).isoformat(),
            charge_mod_tx_id="sim_tx_" + str(int(datetime.now(timezone.utc).timestamp())),
            customer_mobile="9999999999",
            amount=payload.prepaid_amount
        )

    return {
        "status": "success",
        "charger_id": payload.charger_id,
        "connector_id": payload.connector_id,
        "response": res
    }

@router.post("/remote-stop")
def admin_remote_stop(payload: RemoteStopPayload):
    """
    Triggers direct remote stop for a charger.
    """
    print(f"[Admin Remote Stop] Direct trigger: Charger {payload.charger_id}")
    
    # 1. Stop Charger simulation
    if get_payment_mode() == "dummy":
        sim_path = os.path.join(BASE_DIR, "data", "active_simulation_session.json")
        if os.path.exists(sim_path):
            try:
                os.remove(sim_path)
            except Exception:
                pass
        
        upsert_transaction(
            charger_id=payload.charger_id,
            charging_status="stopped",
            charging_stop_time=datetime.now(timezone.utc).isoformat()
        )
        
        return {
            "status": "success",
            "message": "Simulated stop completed."
        }

    # 2. Stop Charger Live
    # Try custom socket stop first
    stop_success = False
    active_path = os.path.join(BASE_DIR, "data", "active_payments.json")
    if os.path.exists(active_path):
        try:
            with open(active_path, "r") as f:
                data = json.load(f)
            active_payment = data.get(payload.charger_id.strip())
            if active_payment and active_payment.get("transaction_id"):
                tx_id = active_payment["transaction_id"]
                conn_id = active_payment.get("connector_id") or 1
                
                # Fetch Connection Type
                from chargepoints import fetch_chargepoint_details
                connection_type = "GRIDSCAPE"
                details = fetch_chargepoint_details(payload.charger_id)
                if details:
                    connection_type = details.get("chargePointConnectionProtocol", "GRIDSCAPE")
                    
                qr_stop_url = f"https://tts.console.chargemod.com/{payload.charger_id}/Socket-RemoteStopTransaction"
                qr_stop_payload = {
                    "transactionId": tx_id,
                    "connectionType": connection_type,
                    "connectorId": int(conn_id)
                }
                
                from auth_key import get_auth_token
                token = get_auth_token()
                headers = { "Content-Type": "application/json" }
                if token:
                    headers["Authorization"] = f"Bearer {token}"
                    
                response = requests.post(qr_stop_url, json=qr_stop_payload, headers=headers)
                if response.status_code == 200:
                    stop_success = True
        except Exception as e:
            print(f"[Admin Remote Stop Error] Socket stop exception: {e}")

    # Fallback to standard Stop action
    res = charger_action(
        action="stop",
        charger_identity=payload.charger_id,
        confirmed_mobile="0000000000"
    )

    if "error" in res or (res.get("status") != "success" and res.get("status") != "no_active_session"):
        raise HTTPException(status_code=400, detail=res.get("error") or "Remote stop failed")

    # Clear active payment mapping
    try:
        if os.path.exists(active_path):
            with open(active_path, "r") as f:
                data = json.load(f)
            key = payload.charger_id.strip()
            if key in data:
                del data[key]
                with open(active_path, "w") as f:
                    json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[Admin Remote Stop] Error clearing mapping: {e}")

    upsert_transaction(
        charger_id=payload.charger_id,
        charging_status="stopped",
        charging_stop_time=datetime.now(timezone.utc).isoformat()
    )

    return {
        "status": "success",
        "response": res
    }

@router.get("/config")
def get_config():
    """
    Returns current active server configuration mode.
    """
    return {
        "payment_mode": get_payment_mode()
    }

@router.post("/config")
def update_config(payload: ConfigPayload):
    """
    Dynamically switches PAYMENT_MODE between 'dummy' and 'live' in-memory and writes it to .env.
    """
    new_mode = payload.payment_mode.lower().strip()
    if new_mode not in ["dummy", "live"]:
        raise HTTPException(status_code=400, detail="Invalid config mode. Must be 'dummy' or 'live'")

    # 1. Update In-Memory Config variables
    import app.config
    app.config.PAYMENT_MODE = new_mode
    
    # Update global environment for other parts of the system
    os.environ["PAYMENT_MODE"] = new_mode

    # 2. Persistently update the .env file
    env_path = os.path.join(BASE_DIR, ".env")
    lines = []
    if os.path.exists(env_path):
        try:
            with open(env_path, "r") as f:
                lines = f.readlines()
        except Exception:
            pass

    found = False
    for i, line in enumerate(lines):
        if line.startswith("PAYMENT_MODE="):
            lines[i] = f"PAYMENT_MODE={new_mode}\n"
            found = True
            break

    if not found:
        lines.append(f"PAYMENT_MODE={new_mode}\n")

    try:
        with open(env_path, "w") as f:
            f.writelines(lines)
    except Exception as e:
        print(f"[Admin Config Error] Failed to write to .env: {e}")
        return {
            "status": "success",
            "payment_mode": new_mode,
            "message": f"Updated mode in-memory to '{new_mode}', but failed to write to .env file: {str(e)}"
        }

    return {
        "status": "success",
        "payment_mode": new_mode,
        "message": f"Successfully updated server mode to '{new_mode}' (persistent across restarts)"
    }
