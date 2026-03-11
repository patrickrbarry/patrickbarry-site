#!/usr/bin/env python3
"""
One-time Spotify OAuth token helper.
Run this locally once to get your refresh token, then add it as a GitHub secret.

Usage:
    python3 scripts/get_spotify_token.py
"""

import urllib.parse
import webbrowser
import sys
import base64
import json

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

# ── Redirect URI must match exactly what's saved in your Spotify app settings.
REDIRECT_URI = "https://patrickbarry.netlify.app"
SCOPES = "user-read-recently-played user-top-read"

print("\n── Spotify Token Setup ──────────────────────────")
print("Paste the values from your Spotify Developer Dashboard.\n")
CLIENT_ID     = input("Client ID:     ").strip()
CLIENT_SECRET = input("Client Secret: ").strip()

auth_url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
    "client_id":     CLIENT_ID,
    "response_type": "code",
    "redirect_uri":  REDIRECT_URI,
    "scope":         SCOPES,
})

print("\nOpening Spotify authorization in your browser…")
print("(If it doesn't open automatically, copy/paste this URL into your browser)\n")
print(auth_url)
webbrowser.open(auth_url)

print("\n─────────────────────────────────────────────────")
print("After you click 'Agree', your browser will redirect to patrickbarry.netlify.app")
print("with a long '?code=...' at the end of the URL.")
print("")
print("Copy the FULL URL from your browser's address bar and paste it below.")
print("─────────────────────────────────────────────────\n")

redirect_url = input("Paste the full redirect URL here: ").strip()

# Extract the code from the URL
parsed = urllib.parse.urlparse(redirect_url)
params = urllib.parse.parse_qs(parsed.query)

if "error" in params:
    print(f"❌ Authorization denied: {params['error'][0]}")
    sys.exit(1)

if "code" not in params:
    print("❌ Could not find 'code' in the URL. Make sure you pasted the full redirect URL.")
    sys.exit(1)

code = params["code"][0]

# Exchange code for tokens
creds = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
resp = requests.post(
    "https://accounts.spotify.com/api/token",
    headers={"Authorization": f"Basic {creds}"},
    data={
        "grant_type":   "authorization_code",
        "code":          code,
        "redirect_uri":  REDIRECT_URI,
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
print("\nThen go to: GitHub → Actions → Update Spotify Data → Run workflow")
