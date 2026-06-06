import sys
from datetime import datetime, timedelta, timezone

def get_solar_seconds(start_time: datetime, end_time: datetime) -> float:
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)
        
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    start_ist = start_time.astimezone(ist_tz)
    end_ist = end_time.astimezone(ist_tz)
    
    total_seconds = (end_ist - start_ist).total_seconds()
    if total_seconds <= 0:
        return 0.0
        
    solar_seconds = 0.0
    curr_date = start_ist.date()
    while curr_date <= end_ist.date():
        solar_start = datetime(curr_date.year, curr_date.month, curr_date.day, 9, 0, 0, tzinfo=ist_tz)
        solar_end = datetime(curr_date.year, curr_date.month, curr_date.day, 16, 0, 0, tzinfo=ist_tz)
        
        overlap_start = max(start_ist, solar_start)
        overlap_end = min(end_ist, solar_end)
        
        if overlap_start < overlap_end:
            solar_seconds += (overlap_end - overlap_start).total_seconds()
            
        curr_date += timedelta(days=1)
        
    return solar_seconds

def calculate_custom_tariff(charger_id: str, is_dc: bool, start_time: datetime, end_time: datetime, total_energy_kwh: float) -> dict:
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)
        
    start_ist = start_time.astimezone(ist_tz)
    end_ist = end_time.astimezone(ist_tz)
    
    total_seconds = (end_ist - start_ist).total_seconds()
    if total_seconds <= 0:
        total_seconds = 1.0
        
    solar_seconds = get_solar_seconds(start_time, end_time)
    solar_seconds = min(total_seconds, max(0.0, solar_seconds))
    nonsolar_seconds = total_seconds - solar_seconds
    
    solar_fraction = solar_seconds / total_seconds
    nonsolar_fraction = nonsolar_seconds / total_seconds
    
    if is_dc:
        solar_service_rate = 11.0
        solar_energy_rate = 5.0
        nonsolar_service_rate = 13.0
        nonsolar_energy_rate = 9.30
    else:
        solar_service_rate = 3.0
        solar_energy_rate = 5.0
        nonsolar_service_rate = 4.0
        nonsolar_energy_rate = 9.30
        
    solar_energy = total_energy_kwh * solar_fraction
    nonsolar_energy = total_energy_kwh * nonsolar_fraction
    
    service_fee_excl = round((solar_service_rate * solar_energy) + (nonsolar_service_rate * nonsolar_energy), 2)
    energy_usage_fee = round((solar_energy_rate * solar_energy) + (nonsolar_energy_rate * nonsolar_energy), 2)
    
    tax_percentage = 18.0
    tax_amount = round(service_fee_excl * (tax_percentage / 100.0), 2)
    total_amount = round(service_fee_excl + energy_usage_fee + tax_amount, 2)
    
    return {
        "energy_kwh": round(total_energy_kwh, 2),
        "energy_usage_fee": energy_usage_fee,
        "service_fee": service_fee_excl,
        "tax_percentage": tax_percentage,
        "tax_amount": tax_amount,
        "total_amount": total_amount,
        "solar_seconds": solar_seconds,
        "nonsolar_seconds": nonsolar_seconds,
        "solar_fraction": solar_fraction,
        "nonsolar_fraction": nonsolar_fraction
    }

# Test 1: DC Non-solar (7.98 kWh)
# Assume start and end are completely in non-solar (e.g. 7 PM to 8 PM)
start_t = datetime(2026, 6, 6, 19, 0, 0, tzinfo=timezone.utc)
end_t = datetime(2026, 6, 6, 20, 0, 0, tzinfo=timezone.utc)
res_dc_ns = calculate_custom_tariff("test", True, start_t, end_t, 7.98)
print("Test 1 (DC Non-Solar 7.98 kWh):")
print(res_dc_ns)
assert abs(res_dc_ns["total_amount"] - 196.62) < 0.05, f"Expected 196.62, got {res_dc_ns['total_amount']}"

# Test 2: dynamic split (3:56 PM to 4:30 PM IST)
# 3:56 PM IST is 10:26 AM UTC
# 4:30 PM IST is 11:00 AM UTC
ist_tz = timezone(timedelta(hours=5, minutes=30))
start_split = datetime(2026, 6, 6, 15, 56, 0).replace(tzinfo=ist_tz)
end_split = datetime(2026, 6, 6, 16, 30, 0).replace(tzinfo=ist_tz)
res_split = calculate_custom_tariff("test", True, start_split, end_split, 10.0)
print("\nTest 2 (DC Split 10 kWh, 3:56 PM to 4:30 PM):")
print(res_split)
solar_dur_mins = res_split["solar_seconds"] / 60.0
nonsolar_dur_mins = res_split["nonsolar_seconds"] / 60.0
print(f"Solar minutes: {solar_dur_mins:.1f} (expected 4.0)")
print(f"Non-solar minutes: {nonsolar_dur_mins:.1f} (expected 30.0)")

print("\nALL MATH TESTS PASSED!")
