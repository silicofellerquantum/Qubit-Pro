import os
import sys
import razorpay
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("RAZORPAY_KEY_ID")
secret = os.getenv("RAZORPAY_KEY_SECRET")

if not key:
    print("No key")
    sys.exit(1)

client = razorpay.Client(auth=(key, secret))

try:
    res = client.customer.create({"name": "DIFFERENT NAME", "email": "admin@example.com", "fail_existing": "0"})
    print("Created:", res)
except Exception as e:
    print("Error creating:", e)

print("Fetching all with email...")
res2 = client.customer.all({"email": "admin@example.com"})
print("Result:", res2)
for c in res2.get("items", []):
    if c.get("email") == "admin@example.com":
        print("Found:", c["id"])
