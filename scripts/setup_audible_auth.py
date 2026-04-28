#!/usr/bin/env python3
"""
Two-step Audible auth setup — no interactive input required.

  Step 1 (no args):   generate login URL, save state, print URL
  Step 2 (URL arg):   complete auth from redirect URL, save audible_auth.json
"""

import sys
import json
import base64
from pathlib import Path
from urllib.parse import urlparse, parse_qs

try:
    import audible
    import audible.login as _login
    import audible.localization as _loc
    from audible.auth import register_ as _register, Authenticator
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "audible", "-q"])
    import audible
    import audible.login as _login
    import audible.localization as _loc
    from audible.auth import register_ as _register, Authenticator

STATE_FILE = Path("/tmp/audible_auth_state.json")
OUT_FILE   = Path(__file__).parent.parent / "audible_auth.json"


def step1():
    """Generate login URL and save state."""
    locale = _loc.Locale("us")

    code_verifier = _login.create_code_verifier()
    oauth_url, serial = _login.build_oauth_url(
        country_code=locale.country_code,
        domain=locale.domain,
        market_place_id=locale.market_place_id,
        code_verifier=code_verifier,
    )

    STATE_FILE.write_text(json.dumps({
        "code_verifier": code_verifier.decode(),
        "serial":        serial,
        "domain":        locale.domain,
    }))

    print("\n" + "="*60)
    print("Open this URL in your browser and log in with Amazon:")
    print("="*60)
    print(oauth_url)
    print("="*60)
    print("\nAfter login your browser will show a blank/error page.")
    print("Copy the full URL from the address bar and paste it back in the chat.")
    print(f"\n(State saved to {STATE_FILE})\n")


def step2(redirect_url: str):
    """Complete auth from redirect URL and save credentials."""
    if not STATE_FILE.exists():
        print("ERROR: No state found. Run step 1 first (no arguments).")
        sys.exit(1)

    state = json.loads(STATE_FILE.read_text())
    code_verifier = state["code_verifier"].encode()
    serial        = state["serial"]
    domain        = state["domain"]

    # Extract authorization code from redirect URL
    parsed = urlparse(redirect_url)
    params = parse_qs(parsed.query)
    auth_codes = params.get("openid.oa2.authorization_code", [])
    if not auth_codes:
        print("ERROR: No authorization_code found in URL. Make sure you copied the full URL.")
        sys.exit(1)
    authorization_code = auth_codes[0]

    print("Exchanging authorization code for tokens…")
    register_data = _register(
        authorization_code=authorization_code,
        code_verifier=code_verifier,
        domain=domain,
        serial=serial,
    )

    auth = Authenticator()
    auth.locale = _loc.Locale("us")
    auth._update_attrs(**register_data)
    auth.to_file(str(OUT_FILE))

    print(f"✅ Auth saved to {OUT_FILE}")

    encoded = base64.b64encode(OUT_FILE.read_bytes()).decode()
    print("\n" + "="*60)
    print("Add this as GitHub Secret AUDIBLE_AUTH:")
    print("(Repo → Settings → Secrets → Actions → New repository secret)")
    print("="*60)
    print(encoded)
    print("="*60 + "\n")
    STATE_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        step2(sys.argv[1])
    else:
        step1()
