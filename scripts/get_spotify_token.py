#!/usr/bin/env python3
"""
One-time Spotify OAuth token helper.
Run this locally once to get your refresh token, then add it as a GitHub secret.

Usage:
    python3 scripts/get_spotify_token.py
"""

import urllib.parse
import http.server
import webbrowser
import threading
import sys
import base64
import json

try:
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

REDIRECT_URI = "http://localhost:8888/callback"
SCOPES = "user-read-recently-played user-top-read"

print("\n── Spotify Token Setup ──────────────────────────")
print("Paste the values from your Spotify Developer Dashboard.\n")
CLIENT_ID = input("Client ID:     ").strip()
CLIENT_SECRET = input("Client Secret: ").strip()

auth_url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
    "client_id": CLIENT_ID,
    "response_type": "code",
    "redirect_uri": REDIRECT_URI,
    "scope": SCOPES,
})

captured = {"code": None, "error": None}

class CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if "code" in params:
            captured["code"] = params["code"][0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"<h2 style='font-family:sans-serif'>Done! You can close this tab.</h2>")
        else:
            captured["error"] = params.get("error", ["unknown"])[0]
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"<h2 style='font-family:sans-serif'>Authorization denied.</h2>")
        threading.Thread(target=self.server.shutdown).start()

    def log_message(self, *args):
        pass  # Suppress server logs

print("\nOpening Spotify in your browser…")
print(f"(If it doesn't open, visit: {auth_url})\n")
webbrowser.open(auth_url)

server = http.server.HTTPServer(("localhost", 8888), CallbackHandler)
server.serve_forever()

if not captured["code"]:
    print(f"❌ Authorization failed: {captured['error']}")
    sys.exit(1)

# Exchange code for tokens
creds = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
resp = requests.post(
    "https://accounts.spotify.com/api/token",
    headers={"Authorization": f"Basic {creds}"},
    data={
        "grant_type": "authorization_code",
        "code": captured["code"],
        "redirect_uri": REDIRECT_URI,
    },
)
tokens = resp.json()

if "refresh_token" not in tokens:
    print("❌ Token exchange failed:")
    print(json.dumps(tokens, indent=2))
    sys.exit(1)

print("\n✅ Success! Add these three secrets to GitHub:\n")
print("  Repo → Settings → Secrets and variables → Actions → New repository secret\n")
print(f"  SPOTIFY_CLIENT_ID      = {CLIENT_ID}")
print(f"  SPOTIFY_CLIENT_SECRET  = {CLIENT_SECRET}")
print(f"  SPOTIFY_REFRESH_TOKEN  = {tokens['refresh_token']}")
print("\nThen trigger the workflow manually from GitHub → Actions → Update Spotify Data → Run workflow")
