import requests
import json
import os
import sys
from urllib.parse import quote
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Use /data volume if available (Docker), otherwise use local data/ folder
if os.path.exists("/data"):
    DATA_DIR = "/data"
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR = os.path.join(BASE_DIR, "data")

CHARGER_DIR = os.path.join(DATA_DIR, "chargers")
os.makedirs(CHARGER_DIR, exist_ok=True)

from auth_key import get_auth_token, invalidate_token

# ===== LOAD ENV =====
load_dotenv()
# BASE_LS is now fetched dynamically inside functions.

# Guard check to avoid crashing the agent on import if env isn't fully loaded yet
def _check_config():
    if not BASE_LS:
        print("⚠️ Warning: BASE_LS missing in .env. EV tools may fail.")
        return False
    return True


# ============================
# AUTH-AWARE REQUEST HELPER
# On 401/403 → invalidates stale cache, force-refreshes token, retries once.
# This is needed because the JWT expires sooner than the 47h cache window.
# ============================
def make_api_request(method, url, **kwargs):
    token = get_auth_token()
    if not token:
        print("Failed to get auth token")
        return None

    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    headers.setdefault("Accept", "application/json")

    response = requests.request(method, url, headers=headers, **kwargs)

    if response.status_code in (401, 403):
        print(f"[make_api_request] {response.status_code} — token likely expired. Invalidating cache and refreshing...")
        invalidate_token()
        new_token = get_auth_token(force_refresh=True)
        if not new_token:
            print("Token refresh failed.")
            return response  # return original 403 so callers can handle
        headers["Authorization"] = f"Bearer {new_token}"
        response = requests.request(method, url, headers=headers, **kwargs)

    return response


# ============================
# FETCH CHARGER LIST
# ============================
def fetch_chargepoint_list(identifier, charger_type=None):
    identifier = str(identifier)
    encoded_key = quote(identifier)
    type_param = (charger_type or "").upper()

    url = (
        f"{os.getenv('BASE_LS', 'https://ls.console.chargemod.com')}/charger/get-chargers/"
        f"?organizationId=64b793030dd6bb39c1c3e270"
        f"&projectId=6494141957d29409895704d2"
        f"&skip=0&limit=10"
        f"&connected=false&disconnected=false"
        f"&key={encoded_key}"
        f"&type={type_param}"
        f"&country=&state=&city=&locationId=&oem=&device=&organization=&ocpiChargers=true"
    )

    response = make_api_request("POST", url)

    if response is None:
        return {"error": "api_failure", "message": "Failed to get auth token"}

    if response.status_code != 200:
        print(" API Error:", response.text)
        return {
            "error": "api_failure",
            "status_code": response.status_code,
            "message": "Failed to fetch charger data"
        }

    try:
        data = response.json()

        filtered_chargepoints = [
            {
                "identity": cp.get("identity"),
                "chargerName": cp.get("chargerName"),
                "locationName": cp.get("locationName"),
                "locationId": cp.get("locationId"),
                "geoLocation": cp.get("geoLocation")
            }
            for cp in data.get("chargepoints", [])
        ]

        final_output = {
            "chargepoints": filtered_chargepoints,
            "count": data.get("count", 0)  #  FIXED
        }

        # Save for debugging
        file_path = os.path.join(CHARGER_DIR, "chargers_list.json")
        with open(file_path, "w") as f:
            json.dump(final_output, f, indent=2)

        return final_output

    except Exception as e:
        print(" Parse Error:", e)
        print("Response:", response.text)
        return None


# ============================
# REBUILD ALL_CHARGERS_DB
# ============================
def rebuild_charger_db():
    """
    Rebuilds all_chargers_db.json directly from MongoDB.
    Joins chargepoints + locations to get all required fuzzy-match fields:
    identity, chargerId, chargerName, locationName, locationId.
    Much faster and more complete than the API approach.
    """
    from pymongo import MongoClient
    from bson import ObjectId

    MONGO_URI   = os.getenv("MONGO_URI")
    PROJECT_ID  = ObjectId("6494141957d29409895704d2")

    print("[rebuild_charger_db] Connecting to MongoDB...")
    client = MongoClient(MONGO_URI)
    db = client["console"]

    print("[rebuild_charger_db] Running aggregation (chargepoints + locations)...")
    pipeline = [
        {"$match": {"projectId": PROJECT_ID}},
        {"$lookup": {
            "from": "locations",
            "localField": "locationId",
            "foreignField": "locationId",
            "as": "location"
        }},
        {"$project": {
            "_id": 1,
            "identity": 1,
            "chargerId": 1,
            "chargerName": 1,
            "locationId": 1,
            "locationName": {"$arrayElemAt": ["$location.name", 0]}
        }}
    ]

    all_chargers = []
    for doc in db["chargepoints"].aggregate(pipeline, allowDiskUse=True):
        all_chargers.append({
            "identity":     doc.get("identity"),
            "chargerId":    doc.get("chargerId"),
            "chargerName":  doc.get("chargerName"),
            "locationName": doc.get("locationName"),
            "locationId":   doc.get("locationId"),
            "_id":          str(doc.get("_id", ""))
        })

    client.close()

    db_path = os.path.join(CHARGER_DIR, "all_chargers_db.json")
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump({"chargepoints": all_chargers, "count": len(all_chargers)}, f, ensure_ascii=False)

    print(f"[rebuild_charger_db] Done. {len(all_chargers)} chargers saved to {db_path}")
    return len(all_chargers)


# ============================
# RESOLVE CHARGER
# ============================
def resolve_charger(identifier, charger_type=None):
    import re
    identifier_str = str(identifier).lower().strip()
    
    # Normalize c b / cb spacing and punctuation (e.g. cb140, c b 140, c.b. 140, cb-140 -> cb 140)
    identifier_str = re.sub(r'\bc[\s._\-\/]*b[\s._\-\/]*(\d+)', r'cb \1', identifier_str)
    
    # Normalize cmod spacing and punctuation (e.g. c.m.o.d. 0135, c m o d 0135, cmod-0135 -> cmod0135)
    identifier_str = re.sub(r'\bc[\s._\-\/]*m[\s._\-\/]*o[\s._\-\/]*d[\s._\-\/]*(\d+)', r'cmod\1', identifier_str)
    
    # Clean up multiple spaces
    identifier_str = re.sub(r'\s+', ' ', identifier_str).strip()
    
    identifier = identifier_str

    #  Identity shortcut (typically 15+ digits)
    if identifier.isdigit() and len(identifier) > 10:
        return {
            "status": "resolved",
            "charger": {"identity": identifier}
        }

    list_data = fetch_chargepoint_list(identifier, charger_type)

    if not list_data or not list_data.get("chargepoints"):
        # 🔥 FALLBACK: Check if it exists as a different type
        if charger_type:
            fallback_data = fetch_chargepoint_list(identifier, None)
            if fallback_data and fallback_data.get("chargepoints"):
                actual_type = "AC" if charger_type.upper() == "DC" else "DC"
                return {
                    "status": "wrong_type",
                    "actual_type": actual_type
                }

        return {
            "status": "not_found",
            "message": f"No chargers found for '{identifier}'"
        }

    chargepoints = list_data["chargepoints"]

    #  Single result
    if len(chargepoints) == 1:
        return {
            "status": "resolved",
            "charger": chargepoints[0]
        }

    matched = [
        cp for cp in chargepoints
        if identifier.replace(" ", "") in (cp.get("chargerName") or "").lower().replace(" ", "")
        or identifier.replace(" ", "") in (cp.get("locationName") or "").lower().replace(" ", "")
        or identifier.replace(" ", "") in (cp.get("identity") or "").lower().replace(" ", "")
        or identifier.replace(" ", "") in (cp.get("chargerId") or "").lower().replace(" ", "")
    ]

    if len(matched) == 1:
        return {
            "status": "resolved",
            "charger": matched[0]
        }

    # ⚠ Multiple → ask user
    return {
        "status": "multiple",
        "options": [
            {
                "identity": cp.get("identity"),
                "label": f"{cp.get('chargerName')} - {cp.get('locationName')}"
            }
            for cp in chargepoints[:5]  #  LIMIT
        ]
    }


# ============================
# FETCH CHARGER DETAILS
# ============================
def fetch_chargepoint_details(identity):
    url = (
        f"{os.getenv('BASE_LS', 'https://ls.console.chargemod.com')}/charger/get-charger-v2/{identity}/"
        f"?organizationId=64b793030dd6bb39c1c3e270"
        f"&projectId=6494141957d29409895704d2"
    )

    response = make_api_request("GET", url)

    if response is None:
        return None

    if response.status_code != 200:
        print(" Details API Error:", response.text)
        return None

    try:
        data = response.json()
        # The API usually wraps the object in a 'data' key or returns the object directly
        # Adjusting to ensure we are working with the correct dictionary
        charger_data = data.get("data", data) if isinstance(data, dict) else data

        # ===== FILTERED CHARGER BASE =====
        filtered_charger = {
            "chargerName": charger_data.get("chargerName"),
            "identity": charger_data.get("identity"),
            "chargerId": charger_data.get("chargerId"),
            "locationId": charger_data.get("locationId"),
            "chargePointConnectionProtocol": charger_data.get("chargePointConnectionProtocol"),
            "stationType": charger_data.get("stationType"),
            "maintenanceStatus": charger_data.get("maintenanceStatus"),
            "isFree": charger_data.get("isFree"),
            "featureDetails": [
                {
                    "name": f.get("name"),
                    "description": f.get("description")
                }
                for f in charger_data.get("featureDetails", [])
            ],
            "oem": {
                "oemName": charger_data.get("oem", {}).get("oemName") if isinstance(charger_data.get("oem"), dict) else None
            },
            "device": {
                "deviceName": charger_data.get("device", {}).get("deviceName") if isinstance(charger_data.get("device"), dict) else None
            },
            "available": charger_data.get("available"),
        }

        # ===== FILTERED EVSES & CONNECTORS =====
        filtered_evses = []
        for evse in charger_data.get("evses", []):
            cons = evse.get("connectors", {})
            if isinstance(cons, list) and len(cons) > 0:
                cons = cons[0]
            elif not isinstance(cons, dict):
                cons = {}
            
            power_type = cons.get("powerType")
            if isinstance(power_type, dict):
                power_type = power_type.get("powerType")

            # Clean New Tariff
            nt = evse.get("newTariff")
            new_tariff_clean = None
            if isinstance(nt, dict):
                tariff_obj = nt.get("tariff")
                clean_tariff = None
                if isinstance(tariff_obj, dict):
                    clean_tariff = dict(tariff_obj)
                    # Remove internal metadata for support clarity
                    for key in ["_id", "projectId", "delFlag", "createdAt", "updatedAt", "__v"]:
                        clean_tariff.pop(key, None)
                else:
                    clean_tariff = tariff_obj
                
                new_tariff_clean = {
                    "connectorId": nt.get("connectorId"),
                    "tariff": clean_tariff
                }

            filtered_evses.append({
                "status": evse.get("status"),
                "connectorStatus": evse.get("connectorStatus"),
                "connectorErrCode": evse.get("connectorErrCode"),
                "connectorId": evse.get("connectorId"),
                "physicalReference": evse.get("physicalReference"),
                "maxOutputPower": evse.get("maxOutputPower"),
                "connectors": {
                    "name": cons.get("name"),
                    "powerType": power_type,
                    "maxVoltage": cons.get("maxVoltage"),
                    "maxAmperage": cons.get("maxAmperage"),
                    "maxElectricPower": cons.get("maxElectricPower")
                },
                "newTariff": new_tariff_clean
            })

        filtered_charger["evses"] = filtered_evses

        # ===== CLEANED GLOBAL TARIFF =====
        filtered_charger["tariff"] = [
            {
                "deductiveType": t.get("deductiveType") if "deductiveType" in t else t.get("tariff", {}).get("deductiveType"),
                "baseDeductiveAmount": t.get("baseDeductiveAmount") if "baseDeductiveAmount" in t else t.get("tariff", {}).get("baseDeductiveAmount"),
                "extraDeductiveAmount": t.get("extraDeductiveAmount") if "extraDeductiveAmount" in t else t.get("tariff", {}).get("extraDeductiveAmount"),
                "vat": t.get("vat") if "vat" in t else t.get("tariff", {}).get("vat")
            }
            for t in charger_data.get("tariff", [])
        ]

        # Save to local cache
        file_path = os.path.join(CHARGER_DIR, f"charger_{identity}.json")
        with open(file_path, "w") as f:
            json.dump(filtered_charger, f, indent=2)

        return filtered_charger

    except Exception as e:
        print(" Error processing charger details:", e)
        return None