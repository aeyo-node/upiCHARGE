import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
print(f"Connecting to MongoDB...")
client = MongoClient(MONGO_URI)
db = client["console"]

print("Collections inside console database:")
print(db.list_collection_names())

print("\nChecking chargepoints count:")
cp_count = db["chargepoints"].count_documents({})
print(f"Total chargepoints: {cp_count}")

print("\nChecking locations count:")
loc_count = db["locations"].count_documents({})
print(f"Total locations: {loc_count}")

print("\nSample chargepoint:")
sample_cp = db["chargepoints"].find_one()
print(sample_cp)

print("\nSample location:")
sample_loc = db["locations"].find_one()
print(sample_loc)

client.close()
