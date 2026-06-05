import os
import sys
import json
import requests
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, Header
from pydantic import BaseModel
import razorpay

# Ensure api-call directory is on the path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
API_CALL_DIR = os.path.join(BASE_DIR, "api-call")
if API_CALL_DIR not in sys.path:
    sys.path.append(API_CALL_DIR)

from charger_action import charger_action
from app.config import PAYMENT_MODE, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET

router = APIRouter(prefix="/api/payments", tags=["payments"])

class CreateOrderRequest(BaseModel):
    charger_id: str
    connector_id: int
    customer_mobile: str = "9999999999"
    amount: float

def clean_mobile(phone: str) -> str:
    """
    Cleans and standardizes the customer mobile number to a 10-digit string.
    Removes country codes (like +91) and any non-digit characters.
    """
    if not phone:
        return ""
    phone = "".join(filter(str.isdigit, phone))
    if len(phone) == 12 and phone.startswith("91"):
        return phone[-10:]
    if len(phone) == 10:
        return phone
    return phone

def upsert_transaction(order_id: str = None, payment_id: str = None, **kwargs) -> dict:
    """
    Saves or updates a transaction in data/transactions_db.json.
    Matches existing by order_id or payment_id.
    """
    try:
        import os
        import json
        from datetime import datetime, timezone
        
        data_dir = os.path.join(BASE_DIR, "data")
        os.makedirs(data_dir, exist_ok=True)
        filepath = os.path.join(data_dir, "transactions_db.json")
        
        db = []
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                try:
                    db = json.load(f)
                except Exception:
                    db = []
                    
        # Find existing transaction
        tx = None
        for r in db:
            if order_id and r.get("order_id") == order_id:
                tx = r
                break
            if payment_id and r.get("payment_id") == payment_id:
                tx = r
                break
            if not order_id and not payment_id and kwargs.get("charger_id") and r.get("charger_id") == kwargs.get("charger_id") and r.get("status") == "created":
                tx = r
                break
            if not order_id and not payment_id and kwargs.get("charger_id") and r.get("charger_id") == kwargs.get("charger_id") and r.get("charging_status") == "charging":
                tx = r
                break
                
        if tx is None:
            # Create a brand new transaction record
            tx = {
                "order_id": order_id,
                "payment_id": payment_id,
                "charger_id": kwargs.get("charger_id"),
                "connector_id": kwargs.get("connector_id", 1),
                "amount": kwargs.get("amount", 0.0),
                "customer_mobile": kwargs.get("customer_mobile", "9999999999"),
                "status": kwargs.get("status", "created"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "captured_at": None,
                "charging_status": "not_started",
                "charging_start_time": None,
                "charging_stop_time": None,
                "charge_mod_tx_id": None,
                "energy_kwh": 0.0,
                "cost_rs": 0.0,
                "refund_status": "none",
                "refund_amount": 0.0,
                "refund_id": None,
                "refunded_at": None
            }
            db.append(tx)
            
        # Update any explicitly passed arguments
        for k, v in kwargs.items():
            if v is not None:
                tx[k] = v
                
        # Fill in payment_id if we didn't have it and it's passed now
        if payment_id and not tx.get("payment_id"):
            tx["payment_id"] = payment_id
            
        with open(filepath, "w") as f:
            json.dump(db, f, indent=2)
            
        print(f"[DB Log] Upserted transaction Order={order_id}, Payment={payment_id}, Status={tx.get('status')}")
        return tx
    except Exception as e:
        print(f"[DB Log Error] Failed to upsert transaction: {e}")
        return {}

def save_active_payment(charger_id: str, payment_id: str, amount: float, customer_mobile: str, connector_id: int = 1, transaction_id: str = None):
    """
    Saves an active payment record in data/active_payments.json
    keyed by the charger_id so that we can look up the payment_id for refunds on stop.
    Includes the connector_id and optional transaction_id from QR APIs.
    """
    try:
        data_dir = os.path.join(BASE_DIR, "data")
        os.makedirs(data_dir, exist_ok=True)
        filepath = os.path.join(data_dir, "active_payments.json")
        
        data = {}
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                try:
                    data = json.load(f)
                except Exception:
                    data = {}
        
        # Save keyed by charger_id
        data[str(charger_id).strip()] = {
            "payment_id": payment_id,
            "prepaid_amount": amount,
            "customer_mobile": customer_mobile,
            "connector_id": connector_id,
            "transaction_id": transaction_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        print(f"[Webhook Store] Recorded mapping: charger {charger_id} -> payment {payment_id} (₹{amount}, connector {connector_id}, tx {transaction_id})")
    except Exception as e:
        print(f"[Webhook Store] Error saving mapping: {e}")

@router.get("/config")
def get_payments_config():
    """
    Returns the current payment mode and public key for the frontend to decide checkout flows.
    """
    return {
        "payment_mode": PAYMENT_MODE,
        "key_id": RAZORPAY_KEY_ID if PAYMENT_MODE == "live" else "rzp_test_dummy_key_id"
    }

@router.post("/create-order")
async def create_order(req: CreateOrderRequest):
    """
    Generates a secure Razorpay order for client-side checkout.
    If PAYMENT_MODE != "live", returns a mocked order response for offline development.
    """
    amount_paise = int(round(req.amount * 100))
    customer_phone = clean_mobile(req.customer_mobile)
    
    notes = {
        "charger_id": str(req.charger_id).strip(),
        "connector_id": str(req.connector_id).strip(),
        "customer_mobile": customer_phone,
        "prepaid_amount": str(req.amount)
    }

    if PAYMENT_MODE != "live":
        # Simulated Dummy Order
        mock_order_id = f"order_mock_{int(datetime.now(timezone.utc).timestamp())}"
        print(f"[Create Order Dummy] Generated mock order: {mock_order_id} for ₹{req.amount}")
        upsert_transaction(
            order_id=mock_order_id,
            charger_id=str(req.charger_id).strip(),
            connector_id=int(req.connector_id),
            amount=float(req.amount),
            customer_mobile=customer_phone,
            status="created"
        )
        return {
            "key": "rzp_test_dummy_key_id",
            "amount": amount_paise,
            "currency": "INR",
            "name": "upiCHARGE.com",
            "description": "Prepaid EV Charging (Simulated)",
            "order_id": mock_order_id,
            "notes": notes,
            "prefill": {
                "contact": customer_phone
            },
            "dummy_mode": True
        }

    # Live Mode
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        print("[Create Order Error] Razorpay credentials missing in live mode.")
        raise HTTPException(status_code=500, detail="Razorpay credentials not configured on server")

    try:
        client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
        order_payload = {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": f"receipt_{int(datetime.now(timezone.utc).timestamp())}",
            "notes": notes
        }
        order = client.order.create(data=order_payload)
        print(f"[Create Order Live] Successfully created Razorpay order: {order.get('id')}")
        upsert_transaction(
            order_id=order.get("id"),
            charger_id=str(req.charger_id).strip(),
            connector_id=int(req.connector_id),
            amount=float(req.amount),
            customer_mobile=customer_phone,
            status="created"
        )
        return {
            "key": RAZORPAY_KEY_ID,
            "amount": amount_paise,
            "currency": "INR",
            "name": "upiCHARGE.com",
            "description": "Prepaid EV Charging Pre-authorization",
            "order_id": order.get("id"),
            "notes": notes,
            "prefill": {
                "contact": customer_phone
            },
            "dummy_mode": False
        }
    except Exception as e:
        print(f"[Create Order Live Error] Razorpay order creation failed: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to create live Razorpay order: {str(e)}")

@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(None)
):
    """
    Processes verified POST callbacks from Razorpay on payment capture.
    Triggers physical start using custom QR socket APIs, falling back to OCPP start on failure.
    """
    # 1. Capture raw request body bytes for signature verification
    webhook_body = await request.body()
    
    # 2. Verify Signature in Production Mode
    if PAYMENT_MODE == "live" or RAZORPAY_WEBHOOK_SECRET:
        if not x_razorpay_signature:
            print("[Webhook Error] Missing X-Razorpay-Signature header in live request.")
            raise HTTPException(status_code=400, detail="Missing signature header")
        
        if not RAZORPAY_WEBHOOK_SECRET:
            print("[Webhook Error] RAZORPAY_WEBHOOK_SECRET is not configured in .env.")
            raise HTTPException(status_code=500, detail="Webhook secret not configured on server")
            
        try:
            client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
            client.utility.verify_webhook_signature(
                webhook_body.decode('utf-8'),
                x_razorpay_signature,
                RAZORPAY_WEBHOOK_SECRET
            )
            print("[Webhook Signature] Signature verified successfully.")
        except Exception as sig_err:
            print(f"[Webhook Signature Failure] Invalid signature: {sig_err}")
            raise HTTPException(status_code=400, detail="Invalid signature")

    # 3. Parse JSON Body
    try:
        payload = json.loads(webhook_body)
    except Exception as parse_err:
        print(f"[Webhook Error] Failed to parse JSON: {parse_err}")
        raise HTTPException(status_code=400, detail="Invalid JSON format")

    event_type = payload.get("event")
    print(f"[Webhook Event] Received event: {event_type}")

    # 4. Handle Payment Captured Event
    if event_type == "payment.captured":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        
        payment_id = payment_entity.get("id")
        amount_paise = payment_entity.get("amount", 0)
        prepaid_amount = float(amount_paise) / 100.0
        
        notes = payment_entity.get("notes", {}) or {}
        
        # Extract metadata passed by frontend during checkout notes
        charger_id = notes.get("charger_id") or notes.get("chargerId")
        connector_id_raw = notes.get("connector_id") or notes.get("connectorId") or "1"
        customer_mobile_raw = notes.get("customer_mobile") or notes.get("phone") or payment_entity.get("contact")
        
        customer_mobile = clean_mobile(customer_mobile_raw)
        
        try:
            connector_id = int(connector_id_raw)
        except Exception:
            connector_id = 1

        print(f"[Webhook Process] Parsed checkout notes:")
        print(f"  - Payment ID: {payment_id}")
        print(f"  - Prepaid Amount: ₹{prepaid_amount}")
        print(f"  - Charger ID: {charger_id}")
        print(f"  - Connector ID: {connector_id}")
        print(f"  - Mobile: {customer_mobile}")

        if not charger_id:
            print("[Webhook Process Error] No charger_id provided in payment notes. Cannot start session.")
            return {"status": "ignored", "reason": "No charger_id in notes"}

        if not customer_mobile:
            customer_mobile = "9999999999"

        # 5. Fetch connection type for the new custom API
        connection_type = "GRIDSCAPE"
        try:
            from chargepoints import fetch_chargepoint_details
            details = fetch_chargepoint_details(charger_id)
            if details:
                connection_type = details.get("chargePointConnectionProtocol", "GRIDSCAPE")
        except Exception as e:
            print(f"[Webhook Process] Error fetching charger connection protocol: {e}")

        # 6. Execute the new custom QR Remote Start Transaction API
        qr_start_url = f"https://tts.console.chargemod.com/{charger_id}/Socket-RemoteStartTransaction"
        qr_start_payload = {
            "connectorId": connector_id,
            "connectionType": connection_type,
            "idTag": "CHARGEMODTAG",
            "userId": payment_id,
            "organizationId": "64b793030dd6bb39c1c3e270",
            "projectId": "6494141957d29409895704d2",
            "usageType": "WALLET",
            "protocol": "QR"
        }

        print(f"[Webhook Actions] Calling new QR RemoteStart API: {qr_start_url}")
        print(f"[Webhook Actions] Payload: {json.dumps(qr_start_payload)}")

        qr_start_success = False
        qr_response_data = {}
        tx_id = None

        if PAYMENT_MODE == "dummy":
            print("[Webhook Dummy Start] Simulating successful QR start in dummy mode.")
            qr_start_success = True
            tx_id = f"sim_tx_{int(datetime.now(timezone.utc).timestamp())}"
            qr_response_data = {"status": "success", "transactionId": tx_id}
        else:
            try:
                from auth_key import get_auth_token
                token = get_auth_token()
                headers = {
                    "Content-Type": "application/json"
                }
                if token:
                    headers["Authorization"] = f"Bearer {token}"
                
                response = requests.post(qr_start_url, json=qr_start_payload, headers=headers)
                print(f"[Webhook Actions] QR start response code: {response.status_code}")
                print(f"[Webhook Actions] QR start response body: {response.text}")
                
                if response.status_code == 200:
                    qr_response_data = response.json()
                    # Check if body status is Rejected
                    if qr_response_data.get("status") == "Rejected":
                        print(f"[Webhook Actions] QR start API returned Rejected status: {qr_response_data}")
                    else:
                        qr_start_success = True
                        tx_id = qr_response_data.get("transactionId") or qr_response_data.get("result", {}).get("transactionId")
                else:
                    print(f"[Webhook Actions] QR start API failed with status: {response.status_code}")
            except Exception as qr_err:
                print(f"[Webhook Actions] Exception on QR start API: {qr_err}")

        if qr_start_success:
            print(f"[Webhook Actions] QR Start API successful. Captured Transaction ID: {tx_id}")
            # Save mapping with transaction_id and connector_id
            save_active_payment(charger_id, payment_id, prepaid_amount, customer_mobile, connector_id, tx_id)
            upsert_transaction(
                payment_id=payment_id,
                charger_id=charger_id,
                connector_id=connector_id,
                amount=prepaid_amount,
                customer_mobile=customer_mobile,
                status="captured",
                captured_at=datetime.now(timezone.utc).isoformat(),
                charging_status="charging",
                charging_start_time=datetime.now(timezone.utc).isoformat(),
                charge_mod_tx_id=tx_id
            )
            return {
                "status": "success",
                "message": "Payment captured and charger successfully started via new QR API",
                "payment_id": payment_id,
                "charger_id": charger_id,
                "transaction_id": tx_id,
                "response": qr_response_data
            }
        else:
            # 7. Fallback to V1 Start (OCPP trigger under master customer account)
            print(f"[Webhook Actions] New QR start API failed or returned non-success. Falling back to V1 charger_action...")
            res = charger_action(
                action="start",
                charger_identity=charger_id,
                customer_mobile=customer_mobile,
                connector_id=connector_id,
                otp_method="skip"
            )
            print(f"[Webhook Actions] Fallback chargeMOD start response: {json.dumps(res)}")
            
            # Save mapping (we still have payment_id and can store whatever we can)
            save_active_payment(charger_id, payment_id, prepaid_amount, customer_mobile, connector_id)
            
            if "error" in res or res.get("status") != "success":
                upsert_transaction(
                    payment_id=payment_id,
                    charger_id=charger_id,
                    connector_id=connector_id,
                    amount=prepaid_amount,
                    customer_mobile=customer_mobile,
                    status="captured",
                    captured_at=datetime.now(timezone.utc).isoformat(),
                    charging_status="failed",
                    cost_rs=0.0
                )
                raise HTTPException(
                    status_code=400,
                    detail=f"Payment received, but failed to start charger: {res.get('error') or res.get('message')}"
                )
            
            v1_tx_id = res.get("transactionId") or "v1_fallback_tx"
            upsert_transaction(
                payment_id=payment_id,
                charger_id=charger_id,
                connector_id=connector_id,
                amount=prepaid_amount,
                customer_mobile=customer_mobile,
                status="captured",
                captured_at=datetime.now(timezone.utc).isoformat(),
                charging_status="charging",
                charging_start_time=datetime.now(timezone.utc).isoformat(),
                charge_mod_tx_id=v1_tx_id
            )
            return {
                "status": "success",
                "message": "Payment captured and charger successfully started via V1 fallback",
                "payment_id": payment_id,
                "charger_id": charger_id,
                "charge_mod_response": res
            }

    return {"status": "ignored", "reason": f"Event {event_type} not processed"}
