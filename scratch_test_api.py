import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Add api-call directory to python path
sys.path.append(os.path.join(os.path.dirname(__file__), "api-call"))
from chargepoints import fetch_chargepoint_list, fetch_chargepoint_details

print("Testing fetch_chargepoint_list with blank identifier:")
res = fetch_chargepoint_list("")
print(res)

print("\nTesting fetch_chargepoint_list with 'CMOD':")
res_cmod = fetch_chargepoint_list("CMOD")
print(res_cmod)
