#!/usr/bin/env python3
"""
Pull the Greenhouse Companies table from Airtable and write a redacted
company + group list to data/greenhouse.json.

Run by GitHub Actions on a schedule (see .github/workflows/update-greenhouse.yml).

Requires AIRTABLE_TOKEN as an env var (GitHub Actions secret) — never
committed to the repo. Only company name and industry group are written
out; status notes, funding details, and contact info never leave Airtable.

Classification is sticky: a company already grouped in the existing
data/greenhouse.json keeps that group on every run. Only companies new
to Airtable since the last run are added, tagged "Unclassified" — group
them for real via the Claude Code session that maintains this script.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

BASE_ID = "appvXlI5S5rvcLoWl"
TABLE_ID = "tbloHg5tkVUH17s9S"
UNCLASSIFIED = "Unclassified"

TOKEN = os.environ.get("AIRTABLE_TOKEN")
if not TOKEN:
    print("ERROR: AIRTABLE_TOKEN env var not set.", file=sys.stderr)
    sys.exit(1)

HEADERS = {"Authorization": f"Bearer {TOKEN}"}
DATA_PATH = Path(__file__).parent.parent / "data" / "greenhouse.json"


def fetch_all_records():
    records = []
    offset = None
    while True:
        params = {"pageSize": 100}
        if offset:
            params["offset"] = offset
        r = requests.get(
            f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_ID}",
            headers=HEADERS,
            params=params,
        )
        r.raise_for_status()
        data = r.json()
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
    return records


def field(record, *keys):
    f = record.get("fields", {})
    for k in keys:
        if k in f:
            v = f[k]
            if isinstance(v, list):
                return ", ".join(str(x) for x in v)
            return str(v) if v is not None else ""
    return ""


def extract_company_names(records):
    """One name per company, deduped, matching the manual-review dedup rule
    (prefer the Company field; fall back to Client when Company is blank
    or looks like a person's name rather than an org)."""
    names = set()
    for r in records:
        company = field(r, "Company")
        client = field(r, "Client")
        name = company if company and len(company) <= 60 else client
        name = name.strip()
        if name:
            names.add(name)
    return names


def load_existing_groups():
    if not DATA_PATH.exists():
        return {}
    existing = json.loads(DATA_PATH.read_text())
    return {c["name"]: c["group"] for c in existing.get("companies", [])}


def main():
    print("Fetching companies from Airtable…")
    records = fetch_all_records()
    current_names = extract_company_names(records)
    print(f"{len(current_names)} companies in Airtable")

    known_groups = load_existing_groups()
    new_companies = [n for n in current_names if n not in known_groups]

    companies = [
        {"name": name, "group": known_groups.get(name, UNCLASSIFIED)}
        for name in sorted(current_names, key=str.lower)
    ]

    out = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "companies": companies,
    }
    DATA_PATH.write_text(json.dumps(out, indent=2) + "\n")

    print(f"✅ {len(companies)} companies → {DATA_PATH}")
    if new_companies:
        print(f"⚠️  {len(new_companies)} new/unclassified: {', '.join(sorted(new_companies)[:20])}"
              + (" …" if len(new_companies) > 20 else ""))


if __name__ == "__main__":
    main()
