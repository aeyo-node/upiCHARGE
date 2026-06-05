import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import HOST, PORT, PAYMENT_MODE
from app.routers import charging, payments

app = FastAPI(
    title="UPICharge.com Backend",
    description="Mobile-First UPI EV charging orchestration platform.",
    version="1.0.0"
)

# CORS Middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your Next.js frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(charging.router)
app.include_router(payments.router)

@app.on_event("startup")
def startup_event():
    print("==================================================")
    print("UPICharge backend started. Testing chargeMOD connectivity...")
    import sys
    import os
    import json
    import traceback
    
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    sys.path.append(os.path.join(BASE_DIR, "api-call"))
    
    from auth_key import get_auth_token, invalidate_token
    from RemoteStart import get_customer_info, get_wallet_balance, fetch_chargepoint_details
    from charger_action import charger_action
    
    diag_lines = []
    def log_diag(msg):
        print(msg)
        diag_lines.append(msg)
        
    try:
        # Force a fresh login to verify provided credentials
        invalidate_token()
        token = get_auth_token(force_refresh=True)
        if token:
            log_diag("[Startup] chargeMOD login verified successfully! Token cached.")
            log_diag(f"[Startup] Token preview: {token[:15]}...")
        else:
            log_diag("[Startup] ERROR: Failed to log into chargeMOD. Please verify USER_EMAIL and USER_PASSWORD in .env.")
            
        # Check test charger details
        target_charger = "185599798823820"
        log_diag(f"\n[Startup] Querying charger {target_charger} details...")
        details = fetch_chargepoint_details(target_charger)
        if details:
            log_diag(f"[Startup] Charger found: {details.get('chargerName', 'unnamed')}")
            log_diag(f"[Startup] Physical available: {details.get('available')}")
            evses = details.get("evses", [])
            for evse in evses:
                log_diag(f"  - Connector {evse.get('connectorId')}: status={evse.get('connectorStatus')}, physicalReference={evse.get('physicalReference')}")
        else:
            log_diag("[Startup] ERROR: fetch_chargepoint_details returned None for test charger.")
            
        # Check lookup profiles
        lookups = ["vaishnav.ak@chargemod.com", "9562400664", "9999999999"]
        log_diag("\n[Startup] Checking profile lookup accounts:")
        for num in lookups:
            user_info, err = get_customer_info(num)
            if err:
                log_diag(f"  - {num}: error={err}")
            elif user_info:
                balance, b_err = get_wallet_balance(user_info["userId"])
                log_diag(f"  - {num}: name={user_info.get('userName')}, mobile={user_info.get('userMobile')}, balance={balance} Rs., wallet_err={b_err}")
            else:
                log_diag(f"  - {num}: returned empty profile")
                
        # Simulate / test start flow (Disabled in production to prevent auto-starting sessions on hot-reload)
        log_diag("\n[Startup] Simulated startup charger start action skipped to preserve live physical charger state.")
        
    except Exception as e:
        log_diag(f"\n[Startup] Fatal exception during startup diagnostics:\n{traceback.format_exc()}")
        
    # Save log to file
    try:
        with open(os.path.join(BASE_DIR, "startup_diagnostics.log"), "w") as f:
            f.write("\n".join(diag_lines))
        print(f"[Startup] Diagnostics written to startup_diagnostics.log")
    except Exception as log_err:
        print(f"Failed to write startup log: {log_err}")
        
    print("==================================================")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "app": "UPICharge.com REST API",
        "mode": PAYMENT_MODE
    }

if __name__ == "__main__":
    print(f"Starting UPICharge backend in {PAYMENT_MODE} payment mode...")
    uvicorn.run("main:app", host=HOST, port=PORT, reload=False)

