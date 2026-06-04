import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "api-call"))

from RemoteStart import get_customer_info, get_wallet_balance
from auth_key import get_auth_token

token = get_auth_token()
print(f"Token obtained: {token is not None}")

# Test lookup of some mobile numbers
numbers_to_test = ["9562400664", "vaishnav.ak@chargemod.com", "9999999999"]
for num in numbers_to_test:
    print(f"\nTesting lookup for: {num}")
    user, err = get_customer_info(num)
    if err:
        print(f"Error: {err}")
    else:
        print(f"User found: {user}")
        balance, w_err = get_wallet_balance(user["userId"])
        print(f"Wallet balance: {balance}, Error: {w_err}")
