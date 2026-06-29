import urllib.request
import json

# Search for GoogleOAuthProvider in motinath/Quantum_Studio feature/authentication
url = "https://api.github.com/repos/motinath/Quantum_Studio/git/trees/feature/authentication?recursive=1"
headers = {"User-Agent": "Mozilla/5.0"}
req = urllib.request.Request(url, headers=headers)

try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        files = [item.get("path") for item in data.get("tree", []) if item.get("type") == "blob" and ("src" in item.get("path"))]
        
        # Let's inspect router.tsx and __root.tsx first
        target_files = []
        for f in files:
            if "router" in f or "root" in f or "main" in f or "App" in f:
                target_files.append(f)
        
        print("Target files to check for GoogleOAuthProvider:", target_files)
        
        base_url = "https://raw.githubusercontent.com/motinath/Quantum_Studio/feature/authentication/"
        for f in files:
            file_url = base_url + f
            try:
                # fetch and search for GoogleOAuthProvider
                with urllib.request.urlopen(urllib.request.Request(file_url, headers=headers)) as file_resp:
                    content = file_resp.read().decode("utf-8")
                    if "GoogleOAuthProvider" in content:
                        print(f"Found GoogleOAuthProvider in: {f}")
            except Exception as fe:
                pass
except Exception as e:
    print(f"Error: {e}")
