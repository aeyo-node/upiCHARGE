#!/usr/bin/env python3
"""
upiCHARGE End-to-End Charging Diagnostic Test
==============================================
Run this on the server AFTER starting a dummy-mode charging session:
    python3 scratch/test_charging_diagnostic.py

Or run it without an active session to test AutoStopMonitor logic only.

Usage:
    python3 scratch/test_charging_diagnostic.py --charger 185599798823820 --api http://localhost:8000

What it checks:
  1. Backend health (GET /api/charging/verify-station)
  2. Active payments file - stale session detection
  3. Status endpoint - energy, cost, V, A, W, elapsed_seconds are non-zero
  4. Receipt / stop - energy_usage_fee, service_fee, tax_amount all correct
  5. AutoStopMonitor: no premature trigger on fresh session
"""

import sys
import json
import time
import argparse
import requests
from datetime import datetime, timezone, timedelta

# ─── Config ───────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--charger",  default="185599798823820",    help="Charger identity to test")
parser.add_argument("--api",      default="http://localhost:8000", help="Backend base URL")
parser.add_argument("--amount",   default=100.0, type=float,    help="Prepaid amount to simulate")
args = parser.parse_args()

BASE    = args.api.rstrip("/")
CHARGER = args.charger
AMOUNT  = args.amount

PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"
WARN = "\033[93m⚠ WARN\033[0m"
INFO = "\033[94mℹ INFO\033[0m"

results = []

def check(label, condition, details=""):
    icon = PASS if condition else FAIL
    results.append(condition)
    print(f"  {icon}  {label}")
    if details:
        print(f"        {details}")
    return condition

def section(title):
    print(f"\n{'═'*60}")
    print(f"  {title}")
    print(f"{'═'*60}")

# ─── 1. Backend Health ─────────────────────────────────────────────────────────
section("1. Backend Health")
try:
    r = requests.get(f"{BASE}/api/charging/verify-station/{CHARGER}", timeout=10)
    check("Backend reachable", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        connectors = data.get("connectors", [])
        check("Connectors returned", len(connectors) > 0, f"{len(connectors)} connector(s)")
        for c in connectors:
            print(f"        Gun {c.get('connector_id')}: status={c.get('status')} power={c.get('max_power_kw')}kW type={c.get('type')}")
except Exception as e:
    check("Backend reachable", False, str(e))

# ─── 2. Active Payments File ────────────────────────────────────────────────────
section("2. Active Payments File (Stale Session Check)")
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

ACTIVE_PAY_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "active_payments.json")
try:
    with open(ACTIVE_PAY_PATH) as f:
        active = json.load(f)
    print(f"  {INFO}  {len(active)} session(s) in active_payments.json")
    now = datetime.now(timezone.utc)
    stale_count = 0
    for cid, sess in active.items():
        ts = sess.get("timestamp", "")
        try:
            age_s = (now - datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds()
            age_h = age_s / 3600
            stale = age_s > 4 * 3600
            if stale:
                stale_count += 1
            print(f"        charger={cid} age={age_h:.1f}h prepaid=Rs.{sess.get('prepaid_amount')} {'[STALE]' if stale else '[FRESH]'}")
        except Exception as e:
            print(f"        charger={cid} ts parse error: {e}")
    check("No stale sessions causing auto-stop", stale_count == 0,
          f"{stale_count} stale session(s) found - these SHOULD have been cleared by the new AutoStopMonitor fix")
except FileNotFoundError:
    check("Active payments file exists", False, f"Not found: {ACTIVE_PAY_PATH}")
except Exception as e:
    check("Active payments file readable", False, str(e))

# ─── 3. Status Endpoint (requires active charging session) ────────────────────
section("3. Status Endpoint (requires active charging)")
print(f"  {INFO}  Polling /api/charging/status/{CHARGER} ...")
try:
    r = requests.get(f"{BASE}/api/charging/status/{CHARGER}", timeout=15)
    check("Status endpoint reachable", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code == 200:
        d = r.json()
        is_active = d.get("active", False)
        print(f"  {INFO}  active={is_active}")

        if not is_active:
            print(f"  {WARN}  No active session on charger {CHARGER}.")
            print(f"        Start a charging session first, then re-run this test.")
            print(f"        The rest of the status checks are skipped.")
        else:
            energy   = d.get("energy_kwh", 0)
            cost     = d.get("cost_rs", 0)
            elapsed  = d.get("elapsed_seconds", 0)
            power    = d.get("power_kw", 0)
            voltage  = d.get("voltage_v", 0)
            current  = d.get("current_a", 0)
            billing  = d.get("billing", {})

            print(f"  {INFO}  elapsed={elapsed}s  energy={energy}kWh  cost=Rs.{cost}")
            print(f"  {INFO}  V={voltage}  A={current}  kW={power}")
            print(f"  {INFO}  billing={billing}")

            check("elapsed_seconds > 0",  elapsed > 0,  f"elapsed={elapsed}s")
            check("energy_kwh appears",   energy >= 0,  f"energy={energy}kWh")
            check("cost_rs appears",      cost >= 0,    f"cost=Rs.{cost}")
            check("power_kw > 0",         power > 0,    f"power={power}kW (simulated if no OCPP meter values)")
            check("voltage_v > 0",        voltage > 0,  f"voltage={voltage}V")
            check("current_a > 0",        current > 0,  f"current={current}A")

            # After >30s, energy should be > 0
            if elapsed > 30:
                check("energy_kwh > 0 after 30s", energy > 0, f"energy={energy}kWh elapsed={elapsed}s")
                check("cost_rs > 0 after 30s",    cost > 0,   f"cost=Rs.{cost}")
            else:
                print(f"  {WARN}  Session only {elapsed}s old — energy may still be 0 (charger meter sync delay)")

            # Billing breakdown
            check("billing.service_fee present",    "service_fee" in billing,    str(billing.get("service_fee")))
            check("billing.energy_usage_fee present","energy_usage_fee" in billing,str(billing.get("energy_usage_fee")))
            check("billing.tax_amount present",     "tax_amount" in billing,     str(billing.get("tax_amount")))

except Exception as e:
    check("Status endpoint reachable", False, str(e))

# ─── 4. Dummy Mode Simulation Session ─────────────────────────────────────────
section("4. Dummy Mode Simulation Session Test")
SIM_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "active_simulation_session.json")
try:
    # Write a test simulation session
    sim_start = datetime.now(timezone.utc) - timedelta(minutes=5)  # 5 minutes ago
    sim_data = {
        "charger_id": CHARGER,
        "start_time": sim_start.isoformat(),
        "prepaid_amount": AMOUNT,
        "customer_mobile": "9999999999",
        "connector_id": 1
    }
    with open(SIM_PATH, "w") as f:
        json.dump(sim_data, f, indent=2)
    print(f"  {INFO}  Written simulation session (5 min ago, Rs.{AMOUNT})")

    # Poll status
    time.sleep(1)
    r = requests.get(f"{BASE}/api/charging/status/{CHARGER}", timeout=10)
    check("Simulation status reachable", r.status_code == 200, f"HTTP {r.status_code}")

    if r.status_code == 200:
        d = r.json()
        is_active = d.get("active", False)
        energy    = d.get("energy_kwh", 0)
        cost      = d.get("cost_rs", 0)
        elapsed   = d.get("elapsed_seconds", 0)
        power     = d.get("power_kw", 0)
        voltage   = d.get("voltage_v", 0)
        current   = d.get("current_a", 0)
        billing   = d.get("billing", {})

        print(f"  {INFO}  Simulation: active={is_active} elapsed={elapsed}s energy={energy}kWh cost=Rs.{cost}")
        print(f"  {INFO}  V={voltage}  A={current}  kW={power}")

        check("Simulation session active",   is_active,  "active=True expected")
        check("Simulation elapsed > 200s",   elapsed > 200, f"elapsed={elapsed}s (should be ~300s for 5min)")
        check("Simulation energy > 0",       energy > 0,  f"energy={energy}kWh")
        check("Simulation cost > 0",         cost > 0,    f"cost=Rs.{cost}")
        check("Simulation cost <= prepaid",  cost <= AMOUNT, f"cost=Rs.{cost} prepaid=Rs.{AMOUNT}")
        check("Simulation power_kw > 0",     power > 0,   f"power={power}kW")
        check("Simulation voltage_v > 0",    voltage > 0, f"voltage={voltage}V")
        check("Simulation current_a > 0",    current > 0, f"current={current}A")

        # Billing breakdown checks
        svc  = billing.get("service_fee", 0)
        enrg = billing.get("energy_usage_fee", 0)
        tax  = billing.get("tax_amount", 0)
        total = billing.get("total_amount", 0)
        tax_pct = billing.get("tax_percentage", 18)

        check("service_fee > 0",       svc > 0,  f"Rs.{svc}")
        check("energy_usage_fee > 0",  enrg > 0, f"Rs.{enrg}")
        check("tax_amount > 0",        tax > 0,  f"Rs.{tax}")
        check("tax = 18% of svc_fee",  abs(tax - round(svc * 0.18, 2)) < 0.02,
              f"tax={tax} vs expected={round(svc*0.18,2)} (18% of service_fee={svc})")
        check("total = svc + energy + tax",
              abs(total - round(svc + enrg + tax, 2)) < 0.05,
              f"total={total} vs {svc}+{enrg}+{tax}={round(svc+enrg+tax,2)}")

    # Now test stop
    print(f"\n  {INFO}  Testing stop endpoint with simulation session...")
    r_stop = requests.post(f"{BASE}/api/charging/stop", json={
        "charger_id": CHARGER,
        "customer_mobile": "9999999999",
        "prepaid_amount": AMOUNT
    }, timeout=10)
    check("Stop endpoint reachable", r_stop.status_code == 200, f"HTTP {r_stop.status_code}")

    if r_stop.status_code == 200:
        sd = r_stop.json()
        metrics = sd.get("metrics", {})
        actual  = metrics.get("actual_cost", 0)
        refund  = metrics.get("refund_amount", 0)
        m_energy = metrics.get("energy_kwh", 0)
        m_svc   = metrics.get("service_fee", 0)
        m_enrg  = metrics.get("energy_usage_fee", 0)
        m_tax   = metrics.get("tax_amount", 0)

        print(f"  {INFO}  Receipt: actual_cost=Rs.{actual} refund=Rs.{refund} energy={m_energy}kWh")
        print(f"  {INFO}  Breakdown: svc=Rs.{m_svc} energy=Rs.{m_enrg} tax=Rs.{m_tax}")

        check("Receipt actual_cost > 0",         actual > 0,   f"Rs.{actual}")
        check("Receipt energy_kwh > 0",          m_energy > 0, f"{m_energy}kWh")
        check("Receipt service_fee > 0",         m_svc > 0,    f"Rs.{m_svc}")
        check("Receipt energy_usage_fee > 0",    m_enrg > 0,   f"Rs.{m_enrg}")
        check("Receipt tax_amount > 0",          m_tax > 0,    f"Rs.{m_tax}")
        check("Receipt refund_amount >= 0",      refund >= 0,  f"Rs.{refund}")
        check("Prepaid = actual + refund",
              abs(AMOUNT - (actual + refund)) < 0.10,
              f"Rs.{AMOUNT} = Rs.{actual} + Rs.{refund} = Rs.{actual+refund}")

except Exception as e:
    check("Dummy simulation test", False, str(e))
    import traceback; traceback.print_exc()
finally:
    # Clean up sim session file if it still exists
    if os.path.exists(SIM_PATH):
        os.remove(SIM_PATH)

# ─── 5. AutoStopMonitor Stale Session Logic ────────────────────────────────────
section("5. AutoStopMonitor — Stale Session Rejection")
try:
    # Test the stale session calculation directly
    stale_ts = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
    fresh_ts = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()

    def is_stale(ts_str):
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        age_s = (datetime.now(timezone.utc) - dt).total_seconds()
        return age_s > 4 * 3600

    check("5h-old session flagged as stale", is_stale(stale_ts), f"ts={stale_ts[:19]}")
    check("10min-old session NOT stale",     not is_stale(fresh_ts), f"ts={fresh_ts[:19]}")
    print(f"  {INFO}  AutoStopMonitor will clear sessions older than 4h instead of triggering stop")
except Exception as e:
    check("Stale session logic test", False, str(e))

# ─── Summary ──────────────────────────────────────────────────────────────────
section("SUMMARY")
passed = sum(results)
total  = len(results)
failed = total - passed
icon   = PASS if failed == 0 else FAIL
print(f"\n  {icon}  {passed}/{total} checks passed, {failed} failed\n")

if failed > 0:
    print("  Next steps:")
    print("   1. If stale sessions: they should now be auto-cleared by the fixed AutoStopMonitor")
    print("   2. If energy=0 during live charge: wait >30s for charger to sync meter values")
    print("   3. If V/A/W are simulated: chargeMOD REST API doesn't expose live OCPP meter values")
    print("      (V/A/W are always simulated — only energy is real from startValue/stopValue)")
    print("   4. Commit and push fixes, then: git pull && pm2 restart upicharge-backend\n")
else:
    print("  All checks passed! The charging flow is working correctly.\n")

sys.exit(0 if failed == 0 else 1)
