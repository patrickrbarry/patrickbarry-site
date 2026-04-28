#!/usr/bin/env python3
"""
ONE-TIME SETUP — run this locally to authenticate with Audible.

Steps:
  1. pip install audible
  2. python3 scripts/setup_audible_auth.py
  3. A browser URL will be printed — open it, log in with your Amazon account
  4. After login you'll be redirected to localhost (may show an error page — that's fine)
  5. Copy the full redirect URL from your browser's address bar and paste it here
  6. The script saves audible_auth.json and prints the base64 value for GitHub Secrets
"""

import sys
import base64
import json
from pathlib import Path

try:
    import audible
except ImportError:
    print("Installing audible library...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "audible", "-q"])
    import audible

OUT = Path(__file__).parent.parent / "audible_auth.json"

print("\n=== Audible Auth Setup ===\n")
print("This will open an Amazon login URL in your terminal.")
print("Open the URL in your browser, log in, then paste the redirect URL back here.\n")

auth = audible.Authenticator.from_login_external(locale="us")
auth.to_file(str(OUT))

print(f"\n✅ Auth saved to {OUT}")

# Encode for GitHub Secret
content = OUT.read_text()
encoded = base64.b64encode(content.encode()).decode()

print("\n" + "="*60)
print("Add this as a GitHub Secret named AUDIBLE_AUTH:")
print("(Settings → Secrets → Actions → New repository secret)")
print("="*60)
print(encoded)
print("="*60 + "\n")
print("⚠️  Do NOT commit audible_auth.json to git.")
