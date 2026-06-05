import sys
import os
import requests
import json
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

# Ensure api-call directory is on the path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
API_CALL_DIR = os.path.join(BASE_DIR, "api-call")
sys.path.append(API_CALL_DIR)

from charger_action import charger_action
from chargepoints import fetch_chargepoint_details, resolve_charger
from auth_key import get_auth_token
from app.config import PAYMENT_MODE, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
from RemoteStop import extract_active_tx_metrics, calculate_detailed_billing
from app.routers.payments import upsert_transaction

router = APIRouter(prefix="/api/charging", tags=["charging"])

# Organization and Project IDs used by chargeMOD scripts
ORG_ID = "64b793030dd6bb39c1c3e270"
PROJECT_ID = "6494141957d29409895704d2"


# --- Data Models ---

class StartChargingRequest(BaseModel):
    charger_id: str
    connector_id: int
    customer_mobile: str = "9999999999"
    prepaid_amount: float

class StopChargingRequest(BaseModel):
    charger_id: str
    customer_mobile: str = "9999999999"
    prepaid_amount: float


# --- Helper Function ---

def get_active_payment(charger_id: str) -> dict:
    """
    Retrieves the active payment mapping for a charger from data/active_payments.json.
    """
    try:
        import json
        filepath = os.path.join(BASE_DIR, "data", "active_payments.json")
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                data = json.load(f)
                return data.get(str(charger_id).strip())
    except Exception as e:
        print(f"[Charging Router Helper] Error reading payment mapping: {e}")
    return None

def clear_active_payment(charger_id: str):
    """
    Deletes the active payment mapping for a charger from data/active_payments.json.
    """
    try:
        import json
        filepath = os.path.join(BASE_DIR, "data", "active_payments.json")
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                data = json.load(f)
            key = str(charger_id).strip()
            if key in data:
                del data[key]
                with open(filepath, "w") as f:
                    json.dump(data, f, indent=2)
                print(f"[Charging Router Helper] Cleared payment mapping for charger {charger_id}")
    except Exception as e:
        print(f"[Charging Router Helper] Error clearing payment mapping: {e}")

def parse_qr_code(qr_data: str) -> str:
    """
    Parses QR format 'CM-CMOD0135-VLEM' to return 'CMOD0135'.
    If the format doesn't match, returns the raw input.
    """
    if qr_data.startswith("CM-"):
        parts = qr_data.split("-")
        if len(parts) >= 2:
            return parts[1]
    return qr_data


# --- API Routes ---


@router.get("/verify-station/{qr_code}")
def verify_station(qr_code: str):
    """
    Parses scanned QR data and resolves it via chargeMOD APIs to get connector statuses.
    """
    charger_id = parse_qr_code(qr_code)
    
    # 1. Resolve charger
    resolved = resolve_charger(charger_id)
    if resolved.get("status") != "resolved":
        raise HTTPException(
            status_code=404, 
            detail=resolved.get("message", f"Charger {charger_id} not found.")
        )
    
    identity = resolved["charger"]["identity"]
    
    # 2. Fetch chargepoint details
    details = fetch_chargepoint_details(identity)
    if not details:
        raise HTTPException(
            status_code=404, 
            detail=f"Could not fetch details for charger {identity}."
        )
    
    # 3. Clean and map connectors list
    connectors = []
    for evse in details.get("evses", []):
        cons = evse.get("connectors", {})
        if isinstance(cons, list) and len(cons) > 0:
            cons = cons[0]
        elif not isinstance(cons, dict):
            cons = {}
            
        connectors.append({
            "connector_id": evse.get("connectorId"),
            "gun_label": evse.get("physicalReference", f"Gun {evse.get('connectorId')}"),
            "status": evse.get("connectorStatus", evse.get("status", "Unknown")),
            "type": cons.get("name", "Unknown"),
            "power_type": cons.get("powerType", "Unknown"),
            "max_power_kw": evse.get("maxOutputPower", "—"),
        })
        
    return {
        "charger_id": identity,
        "charger_name": details.get("chargerName", identity),
        "location_name": details.get("locationName", "Unknown Station"),
        "status": details.get("available", "offline"),
        "connectors": connectors,
        "raw_parsed_id": charger_id
    }


@router.post("/start")
def start_charging(req: StartChargingRequest):
    """
    Triggers actual remote start on chargeMOD using 'skip' OTP mode.
    """
    print(f"\n[DEBUG /start] Received start charging request:")
    print(f"  - charger_id: {req.charger_id}")
    print(f"  - connector_id: {req.connector_id}")
    print(f"  - customer_mobile: {req.customer_mobile}")
    print(f"  - prepaid_amount: {req.prepaid_amount}")
    
    # Simply call the start sequence with 'skip' so OTP is bypassed
    res = charger_action(
        action="start",
        charger_identity=req.charger_id,
        customer_mobile=req.customer_mobile,
        connector_id=req.connector_id,
        otp_method="skip"
    )
    
    print(f"[DEBUG /start] charger_action result: {res}\n")
    
    if "error" in res or res.get("status") != "success":
        if PAYMENT_MODE == "dummy":
            print(f"[DEBUG /start] charger_action failed: {res}. Bypassing failure since PAYMENT_MODE is 'dummy'. Generating simulated session...")
            res = {
                "status": "success",
                "balance": 100.0,
                "message": "Simulated charging started successfully (bypassed backend failure)."
            }
        else:
            raise HTTPException(
                status_code=400, 
                detail=res.get("error") or res.get("message", "Start failed.")
            )
        
    # Save active session if PAYMENT_MODE is dummy
    if PAYMENT_MODE == "dummy":
        try:
            import json
            sim_dir = os.path.join(BASE_DIR, "data")
            os.makedirs(sim_dir, exist_ok=True)
            sim_path = os.path.join(sim_dir, "active_simulation_session.json")
            
            session_info = {
                "charger_id": req.charger_id,
                "connector_id": req.connector_id,
                "customer_mobile": req.customer_mobile,
                "prepaid_amount": req.prepaid_amount,
                "start_time": datetime.now(timezone.utc).isoformat()
            }
            with open(sim_path, "w") as f:
                json.dump(session_info, f, indent=2)
            print(f"[start-simulation] Saved simulated active session to {sim_path}")
            
            # Log to transaction database
            upsert_transaction(
                charger_id=req.charger_id,
                status="captured",
                captured_at=datetime.now(timezone.utc).isoformat(),
                charging_status="charging",
                charging_start_time=datetime.now(timezone.utc).isoformat(),
                charge_mod_tx_id="sim_tx_" + str(int(datetime.now(timezone.utc).timestamp())),
                customer_mobile=req.customer_mobile,
                amount=req.prepaid_amount
            )
        except Exception as sim_err:
            print(f"[start-simulation] Failed to save simulated active session: {sim_err}")
        
    return {
        "status": "success",
        "message": f"Session triggered on connector {req.connector_id}.",
        "charge_mod_response": res
    }



@router.get("/status/{charger_id}")
def get_charging_status(charger_id: str):
    """
    Scrapes chargeMOD console for any running transactions matching the charger identity.
    Streams active metrics back to the mobile client.
    """
    # 0. Check for active simulation session
    sim_path = os.path.join(BASE_DIR, "data", "active_simulation_session.json")
    if PAYMENT_MODE == "dummy" and os.path.exists(sim_path):
        try:
            import json
            with open(sim_path, "r") as f:
                sim_data = json.load(f)
            
            if sim_data.get("charger_id") == charger_id:
                start_time_raw = sim_data.get("start_time")
                dt_start = datetime.fromisoformat(start_time_raw.replace("Z", "+00:00"))
                elapsed_seconds = int((datetime.now(timezone.utc) - dt_start).total_seconds())
                
                # Simulating increments: 0.015 kWh/sec (approx 54kW charging rate)
                energy_kwh = elapsed_seconds * 0.015
                
                # Tariff: Rs. 15 per kWh + flat Rs. 10 base service fee
                energy_cost = energy_kwh * 15.0
                service_fee = 10.0
                tax_percentage = 18.0
                tax_amount = (energy_cost + service_fee) * (tax_percentage / 100.0)
                total_cost = energy_cost + service_fee + tax_amount
                
                prepaid_limit = float(sim_data.get("prepaid_amount") or 200.0)
                if total_cost >= prepaid_limit:
                    total_cost = prepaid_limit
                    energy_kwh = max(0.0, (prepaid_limit / 1.18 - 10.0) / 15.0)
                    energy_cost = energy_kwh * 15.0
                    tax_amount = prepaid_limit - energy_cost - service_fee
                
                billing = {
                    "energy_kwh": round(energy_kwh, 2),
                    "energy_usage_fee": round(energy_cost, 2),
                    "service_fee": service_fee,
                    "tax_percentage": tax_percentage,
                    "tax_amount": round(tax_amount, 2),
                    "total_amount": round(total_cost, 2)
                }
                
                return {
                    "active": True,
                    "transaction_id": "sim_tx_" + str(int(dt_start.timestamp())),
                    "user_mobile": sim_data.get("customer_mobile"),
                    "user_name": "Guest User",
                    "energy_kwh": round(energy_kwh, 2),
                    "cost_rs": round(total_cost, 2),
                    "elapsed_seconds": elapsed_seconds,
                    "start_time": start_time_raw,
                    "billing": billing,
                    "charger_name": "test device",
                    "location_name": "OCPI Test Location - PROD",
                    "vehicle_model": "Tata Nexon EV",
                    "stop_reason": "Charging"
                }
        except Exception as sim_err:
            print(f"[status-simulation] Error reading simulation session: {sim_err}")

    base_url = os.getenv("BASE_LS", "https://ls.console.chargemod.com")
    token = get_auth_token()
    
    if not token:
        raise HTTPException(status_code=500, detail="Unable to retrieve auth token.")
        
    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end_date = now.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    
    payload = {
        "organizationId": ORG_ID,
        "projectId": PROJECT_ID,
        "perPageCount": 1000,
        "pageNumber": 1,
        "filterDate": {"startDate": start_date, "endDate": end_date},
        "searchValue": {},
        "allowedLocations": [],
        "transactionType": None,
        "sortType": -1,
        "solarType": ""
    }
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        resp = requests.post(f"{base_url}/pwr/charger/get-pwr-active-transaction", json=payload, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Active transaction service returned error.")
            
        data = resp.json()
        results = data.get("result", [])
        
        # Match current active transaction exactly as RemoteStop.py does
        active_tx = None
        for tx in results:
            tx_identity = str(tx.get("identity", "")).strip()
            tx_station_id = str(tx.get("stationId", "")).strip()
            tx_chargepoint_id = str(tx.get("chargepointId", "")).strip()
            tx_charger_id = str(tx.get("chargerId", "")).strip()
            
            # Sometimes it's nested
            if not any([tx_identity, tx_station_id, tx_chargepoint_id, tx_charger_id]):
                charger_details = tx.get("chargerDetails", {}) or {}
                tx_identity = str(charger_details.get("identity", "")).strip()

            target_identity = str(charger_id).strip()
            
            if target_identity in [tx_identity, tx_station_id, tx_chargepoint_id, tx_charger_id]:
                active_tx = tx
                break
                
        if not active_tx:
            # Fallback check: Check physical connector status.
            # If any connector is Charging or Preparing, keep session active to avoid premature stops.
            try:
                from RemoteStop import get_available_connectors
                connectors, _ = get_available_connectors(charger_id)
                if connectors and any(c.get("status") in ["Charging", "Preparing"] for c in connectors):
                    return {
                        "active": True,
                        "transaction_id": "awaiting_sync",
                        "user_mobile": "",
                        "user_name": "Awaiting Sync",
                        "energy_kwh": 0.0,
                        "cost_rs": 0.0,
                        "elapsed_seconds": 0,
                        "start_time": None
                    }
            except Exception as conn_err:
                print(f"[status-fallback] Error checking connectors: {conn_err}")
                
            return {
                "active": False,
                "message": "No active transaction found on this charger."
            }

        # Check if scraped transaction already has a stop timestamp
        if active_tx.get("stopAt") is not None:
            return {
                "active": False,
                "message": "Transaction has already stopped on the backend.",
                "stop_reason": active_tx.get("stopReason") or "Stopped"
            }

        # Check physical connector status if active_tx is found
        try:
            from RemoteStop import get_available_connectors
            connectors, _ = get_available_connectors(charger_id)
            if connectors:
                active_statuses = ["Charging", "Preparing", "SuspendedEV", "SuspendedEVSE"]
                if not any(c.get("status") in active_statuses for c in connectors):
                    print(f"[status] Active transaction found in scraper, but physical connectors are inactive: {connectors}. Marking active: False.")
                    statuses_str = ", ".join(f"Gun {c.get('id')}: {c.get('status')}" for c in connectors)
                    return {
                        "active": False,
                        "message": f"Charger connectors have become inactive (disconnected or stopped). Statuses: {statuses_str}",
                        "stop_reason": "ConnectorDisconnect"
                    }
        except Exception as conn_err:
            print(f"[status] Error checking connectors during active transaction: {conn_err}")


            
        # Clean and return running metrics
        start_time_raw = active_tx.get("startAt")
        elapsed_seconds = 0
        if start_time_raw:
            try:
                # e.g., '2026-06-03T12:00:00.000Z'
                dt_start = datetime.fromisoformat(start_time_raw.replace("Z", "+00:00"))
                elapsed_seconds = int((datetime.now(timezone.utc) - dt_start).total_seconds())
            except Exception:
                pass
                
        billing = calculate_detailed_billing(active_tx)
            
        return {
            "active": True,
            "transaction_id": active_tx.get("transactionId") or active_tx.get("_id"),
            "user_mobile": active_tx.get("userMobile"),
            "user_name": active_tx.get("userName"),
            "energy_kwh": billing["energy_kwh"],
            "cost_rs": billing["total_amount"],
            "elapsed_seconds": elapsed_seconds,
            "start_time": start_time_raw,
            "billing": billing,
            "charger_name": active_tx.get("chargerName") or (active_tx.get("chargerDetails", {}).get("name") if active_tx.get("chargerDetails") else charger_id),
            "location_name": active_tx.get("locationName") or "OCPI Test Location - PROD",
            "vehicle_model": active_tx.get("vehicleModel", "--"),
            "stop_reason": active_tx.get("stopReason", "Stopped Remotely")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch charging state: {e}")
@router.post("/stop")
def stop_charging(req: StopChargingRequest):
    """
    Halts active session and initiates refund processing (simulated or live Razorpay).
    """
    # 0. Intercept active simulation session stopping
    sim_path = os.path.join(BASE_DIR, "data", "active_simulation_session.json")
    if PAYMENT_MODE == "dummy" and os.path.exists(sim_path):
        try:
            import json
            with open(sim_path, "r") as f:
                sim_data = json.load(f)
            
            # Remove simulation session file
            try:
                os.remove(sim_path)
            except Exception:
                pass
                
            start_time_raw = sim_data.get("start_time")
            dt_start = datetime.fromisoformat(start_time_raw.replace("Z", "+00:00"))
            elapsed_seconds = int((datetime.now(timezone.utc) - dt_start).total_seconds())
            
            energy_kwh = elapsed_seconds * 0.015
            energy_cost = energy_kwh * 15.0
            service_fee = 10.0
            tax_percentage = 18.0
            tax_amount = (energy_cost + service_fee) * (tax_percentage / 100.0)
            total_cost = energy_cost + service_fee + tax_amount
            
            prepaid_limit = float(sim_data.get("prepaid_amount") or req.prepaid_amount)
            if total_cost >= prepaid_limit:
                total_cost = prepaid_limit
                energy_kwh = max(0.0, (prepaid_limit / 1.18 - 10.0) / 15.0)
                energy_cost = energy_kwh * 15.0
                tax_amount = prepaid_limit - energy_cost - service_fee
                
            billing = {
                "energy_kwh": round(energy_kwh, 2),
                "energy_usage_fee": round(energy_cost, 2),
                "service_fee": service_fee,
                "tax_percentage": tax_percentage,
                "tax_amount": round(tax_amount, 2),
                "total_amount": round(total_cost, 2)
            }
            
            tx_details = {
                "amount": round(total_cost, 2),
                "energy_kwh": round(energy_kwh, 2),
                "billing": billing,
                "user": "Guest User",
                "charger_name": "test device",
                "location_name": "OCPI Test Location - PROD",
                "vehicle_model": "Tata Nexon EV",
                "stop_reason": "Stopped Remotely",
                "start_time": start_time_raw,
                "stop_time": datetime.now(timezone.utc).isoformat()
            }
            
            # Construct mock charger_action success response
            res = {
                "status": "success",
                "transactionId": "sim_tx_" + str(int(dt_start.timestamp())),
                "tx_details": tx_details
            }
            print(f"[stop-simulation] Simulated stop completed. Final Cost: Rs. {total_cost:.2f}, energy: {energy_kwh:.2f} kWh")
        except Exception as sim_err:
            print(f"[stop-simulation] Error processing simulated stop: {sim_err}")
            res = charger_action(
                action="stop",
                charger_identity=req.charger_id,
                confirmed_mobile="0000000000"
            )
    else:
        # 1. Stop Charger
        # Try calling the new custom QR Remote Stop API directly if we have a transaction ID
        stop_success = False
        active_payment = get_active_payment(req.charger_id)
        if active_payment and active_payment.get("transaction_id"):
            tx_id = active_payment["transaction_id"]
            conn_id = active_payment.get("connector_id") or 1
            
            # Fetch connection protocol
            connection_type = "GRIDSCAPE"
            try:
                details = fetch_chargepoint_details(req.charger_id)
                if details:
                    connection_type = details.get("chargePointConnectionProtocol", "GRIDSCAPE")
            except Exception as e:
                print(f"[Charging stop] Error fetching connection protocol: {e}")
                
            qr_stop_url = f"https://tts.console.chargemod.com/{req.charger_id}/Socket-RemoteStopTransaction"
            qr_stop_payload = {
                "transactionId": tx_id,
                "connectionType": connection_type,
                "connectorId": int(conn_id)
            }
            
            print(f"[Charging stop] Invoking new QR RemoteStop API: {qr_stop_url}")
            print(f"[Charging stop] Payload: {json.dumps(qr_stop_payload)}")
            
            try:
                from auth_key import get_auth_token
                token = get_auth_token()
                headers = {
                    "Content-Type": "application/json"
                }
                if token:
                    headers["Authorization"] = f"Bearer {token}"
                    
                response = requests.post(qr_stop_url, json=qr_stop_payload, headers=headers)
                print(f"[Charging stop] QR Stop response status: {response.status_code}")
                print(f"[Charging stop] QR Stop response body: {response.text}")
                
                if response.status_code == 200:
                    stop_success = True
            except Exception as qr_stop_err:
                print(f"[Charging stop] Exception on new QR Stop API: {qr_stop_err}")

        if stop_success:
            print("[Charging stop] QR Stop API succeeded. Querying final metrics via charger_action stop...")
        else:
            print("[Charging stop] QR Stop API not executed or failed. Falling back to V1 charger_action stop...")

        # Execute charger_action stop to fetch final metrics and tear down/refund
        res = charger_action(
            action="stop",
            charger_identity=req.charger_id,
            confirmed_mobile="0000000000"
        )

    
    if "error" in res or (res.get("status") != "success" and res.get("status") != "no_active_session"):
        raise HTTPException(
            status_code=400, 
            detail=res.get("error") or res.get("message", "Stop failed.")
        )
        
    # 2. Extract final session details
    tx_details = res.get("tx_details", {}) or {}
    
    actual_cost = float(tx_details.get("amount") or 0.0)
    energy_kwh = float(tx_details.get("energy_kwh") or 0.0)
    
    if not tx_details and res.get("status") == "no_active_session":
        billing = {
            "energy_kwh": 0.0,
            "energy_usage_fee": 0.0,
            "service_fee": 0.0,
            "tax_percentage": 18.0,
            "tax_amount": 0.0,
            "total_amount": 0.0
        }
    else:
        billing = tx_details.get("billing") or {
            "energy_kwh": energy_kwh,
            "energy_usage_fee": 0.0,
            "service_fee": 0.27,
            "tax_percentage": 18.0,
            "tax_amount": 0.05,
            "total_amount": actual_cost
        }

    # Format IST times
    def format_to_ist(iso_time_str, fmt="%I:%M %p"):
        if not iso_time_str:
            return "--:--"
        try:
            dt = datetime.fromisoformat(iso_time_str.replace("Z", "+00:00"))
            ist_tz = timezone(timedelta(hours=5, minutes=30))
            dt_ist = dt.astimezone(ist_tz)
            return dt_ist.strftime(fmt)
        except Exception:
            return "--:--"
            
    def format_date_to_ist(iso_time_str):
        return format_to_ist(iso_time_str, fmt="%d %b %Y, %I:%M %p")
        
    current_time_iso = datetime.now(timezone.utc).isoformat()
    start_time_raw = tx_details.get("start_time") or current_time_iso
    stop_time_raw = tx_details.get("stop_time") or current_time_iso
        
    # 3. Retrieve payment mapping if available
    active_payment = get_active_payment(req.charger_id)
    payment_id = None
    prepaid_src = req.prepaid_amount
    
    if active_payment:
        payment_id = active_payment.get("payment_id")
        prepaid_src = float(active_payment.get("prepaid_amount") or req.prepaid_amount)
        print(f"[Charging stop] Found active payment mapping: Payment ID={payment_id}, Prepaid Amount=₹{prepaid_src}")
        
    # 4. Compute Refund
    refund_amount = max(0.0, prepaid_src - billing["total_amount"])
    
    # 5. Process Refund
    refund_status = "simulated"
    if PAYMENT_MODE == "live" and RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
        if payment_id:
            try:
                import razorpay
                client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
                if refund_amount > 0:
                    # Razorpay expects refund amount in subunits (paise)
                    refund_amount_paise = int(round(refund_amount * 100))
                    refund_data = {
                        "amount": refund_amount_paise,
                        "speed": "optimum",
                        "notes": {
                            "reason": f"Automatic refund of unused charging prepaid balance for charger {req.charger_id}"
                        }
                    }
                    refund_res = client.payment.refund(payment_id, refund_data)
                    refund_status = f"refunded_via_razorpay: {refund_res.get('id')}"
                    print(f"[Charging stop] Refund successfully initiated via Razorpay: {refund_res.get('id')} for ₹{refund_amount}")
                else:
                    refund_status = "no_refund_needed_full_amount_used"
                    print("[Charging stop] Refund amount is 0. No refund needed.")
            except Exception as e:
                refund_status = f"razorpay_error: {str(e)}"
                print(f"[Charging stop] Razorpay Refund failed: {e}")
        else:
            refund_status = "missing_payment_id_for_refund"
            print(f"[Charging stop] WARNING: Payment mode is live but no active payment mapping was found for charger {req.charger_id}. Cannot process refund.")
            
    # Clear the mapping now that the session has ended and refund was processed
    if active_payment:
        clear_active_payment(req.charger_id)
            
    # Create an appropriate message
    if refund_status.startswith("refunded_via_razorpay"):
        msg = f"Instant refund of Rs. {refund_amount:.2f} initiated successfully."
    elif refund_status == "no_refund_needed_full_amount_used":
        msg = "Charging completed. No refund needed."
    elif refund_status.startswith("razorpay_error"):
        msg = f"Refund processing failed: please contact support. Error: {refund_status.split(':', 1)[1]}"
    elif refund_status == "missing_payment_id_for_refund":
        msg = f"Stop successful, but refund could not be initiated (Missing payment ID)."
    else:
        msg = f"Refund of Rs. {refund_amount:.2f} processed (Simulated)."

    # Save/update database record
    try:
        ref_id = None
        if refund_status.startswith("refunded_via_razorpay:"):
            ref_id = refund_status.split(":", 1)[1].strip()
        elif "refund_res" in locals() and isinstance(refund_res, dict):
            ref_id = refund_res.get("id")
            
        upsert_transaction(
            payment_id=payment_id,
            charger_id=req.charger_id,
            charging_status="stopped",
            charging_stop_time=stop_time_raw,
            energy_kwh=billing["energy_kwh"],
            cost_rs=billing["total_amount"],
            refund_status=refund_status,
            refund_amount=refund_amount,
            refund_id=ref_id,
            refunded_at=datetime.now(timezone.utc).isoformat() if ("refunded" in refund_status or "simulated" in refund_status) and refund_amount > 0 else None
        )
    except Exception as db_err:
        print(f"[Stop Database update error] {db_err}")

    return {
        "status": "success",
        "charger_id": req.charger_id,
        "metrics": {
            "prepaid_amount": req.prepaid_amount,
            "actual_cost": billing["total_amount"],
            "refund_amount": refund_amount,
            "energy_kwh": billing["energy_kwh"],
            "energy_usage_fee": billing["energy_usage_fee"],
            "service_fee": billing["service_fee"],
            "tax_amount": billing["tax_amount"],
            "tax_percentage": billing["tax_percentage"],
            "user_name": tx_details.get("user", "User"),
            "charger_name": tx_details.get("charger_name", req.charger_id),
            "location_name": tx_details.get("location_name", "OCPI Test Location - PROD"),
            "transaction_id": res.get("transactionId") or "1780500727198__15737782",
            "vehicle_model": tx_details.get("vehicle_model", "--"),
            "stop_reason": tx_details.get("stop_reason", "Stopped Remotely"),
            "start_time_formatted": format_to_ist(start_time_raw) if start_time_raw else "09:02 PM",
            "end_time_formatted": format_to_ist(stop_time_raw) if stop_time_raw else "09:07 PM",
            "session_date_formatted": format_date_to_ist(start_time_raw) if start_time_raw else "03 Jun 2026, 09:02 PM"
        },
        "refund_status": refund_status,
        "message": msg
    }




