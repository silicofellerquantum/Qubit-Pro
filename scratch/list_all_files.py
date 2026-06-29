import urllib.request
import json

url = "https://api.github.com/repos/motinath/Quantum_Studio/git/trees/feature/authentication?recursive=1"
headers = {"User-Agent": "Mozilla/5.0"}
req = urllib.request.Request(url, headers=headers)

try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        for item in data.get("tree", []):
            if item.get("type") == "blob":
                path = item.get("path")
                # Filter for files inside src or backend to keep output manageable
                if "src" in path or "backend/app" in path:
                    print(path)
except Exception as e:
    print(f"Error: {e}")
