import sys
import os
from datetime import datetime, timedelta, timezone

# Add parent directory and api-call directory to sys.path so we can import modules
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)
sys.path.append(os.path.join(parent_dir, "api-call"))
sys.path.append(os.path.join(parent_dir, "app"))

from RemoteStop import calculate_custom_tariff, get_solar_seconds
from app.routers.charging import get_charger_tariff, generate_live_telemetry

def test_tariff_math():
    print("Testing dynamic tariff split math:")
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    
    # 3:56 PM IST to 4:30 PM IST (34 mins total, 4 mins solar, 30 mins non-solar)
    start_time = datetime(2026, 6, 7, 15, 56, 0).replace(tzinfo=ist_tz)
    end_time = datetime(2026, 6, 7, 16, 30, 0).replace(tzinfo=ist_tz)
    
    # Let's say energy is 10.0 kWh
    billing = calculate_custom_tariff(charger_id="185599798823820", start_time=start_time, end_time=end_time, total_energy_kwh=10.0)
    print("Billing:", billing)
    
    # Verify pro-rating
    # Total duration = 2040 seconds
    # Solar duration = 240 seconds
    # Non-solar duration = 1800 seconds
    # Solar fraction = 240/2040 = 0.117647
    # Non-solar fraction = 1800/2040 = 0.882353
    # Solar energy = 1.17647 kWh, Non-solar energy = 8.82353 kWh
    # DC solar service rate = 11.0, DC non-solar service rate = 13.0
    # Service fee excl = 11.0 * 1.17647 + 13.0 * 8.82353 = 12.941 + 114.706 = 127.65 Rs.
    # DC solar energy rate = 5.0, DC non-solar energy rate = 9.30
    # Energy fee = 5.0 * 1.17647 + 9.30 * 8.82353 = 5.882 + 82.059 = 87.94 Rs.
    # Tax amount = 127.65 * 0.18 = 22.98 Rs.
    # Total = 127.65 + 87.94 + 22.98 = 238.57 Rs.
    
    assert abs(billing["service_fee"] - 127.65) < 0.05, f"Expected 127.65, got {billing['service_fee']}"
    assert abs(billing["energy_usage_fee"] - 87.94) < 0.05, f"Expected 87.94, got {billing['energy_usage_fee']}"
    assert abs(billing["tax_amount"] - 22.98) < 0.05, f"Expected 22.98, got {billing['tax_amount']}"
    assert abs(billing["total_amount"] - 238.57) < 0.05, f"Expected 238.57, got {billing['total_amount']}"
    print("Billing values verified successfully!")

def test_telemetry_generator():
    print("\nTesting telemetry generator under limits:")
    # Start a 30kW DC charging session with 100 Rs limit
    start_time = datetime.now(timezone.utc)
    
    # 1. Start of session
    telemetry_start = generate_live_telemetry("185599798823820", elapsed_seconds=10, prepaid_limit=100.0, start_time=start_time)
    print("At 10s:", telemetry_start)
    assert telemetry_start["cost_rs"] < 10.0
    assert telemetry_start["power_kw"] > 0.0
    
    # 2. Over limit session
    # 1 hour at 30kW is 30 kWh, which costs way more than 100 Rs
    telemetry_over = generate_live_telemetry("185599798823820", elapsed_seconds=3600, prepaid_limit=100.0, start_time=start_time)
    print("At 1h (over limit):", telemetry_over)
    assert telemetry_over["cost_rs"] == 100.0
    assert telemetry_over["power_kw"] == 0.0
    assert telemetry_over["current_a"] == 0.0
    assert telemetry_over["billing"]["total_amount"] == 100.0
    print("Telemetry limit capping verified successfully!")

if __name__ == "__main__":
    test_tariff_math()
    test_telemetry_generator()
    print("\nALL WORKFLOW TESTS PASSED!")
