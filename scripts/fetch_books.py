#!/usr/bin/env python3
"""
Fetch books with status='reading' from Supabase and write to data/books.json.
Run by GitHub Actions on a schedule (see .github/workflows/update-books.yml).

No secrets required — uses the public anon key already embedded in the
Bookish browser app.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

SUPABASE_URL = "https://ouiczkqxcbqriiefixsh.supabase.co"
SUPABASE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91aWN6a3F4Y2JxcmlpZWZpeHNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MzY1OTgsImV4cCI6MjA4NDAxMjU5OH0"
    ".2YvZmVt1HPwtWc6z-oTeXn8pNb-PP5J6Des1yPl5vGE"
)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}


def fetch_reading_books():
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/bookslist",
        headers=HEADERS,
        params={
            "status": "eq.reading",
            "select": "title,author,cover_url,genre,fiction_type",
            "order": "title",
        },
    )
    r.raise_for_status()
    return r.json()


def deduplicate(books):
    """Remove duplicate titles (keep first occurrence)."""
    seen = set()
    out = []
    for b in books:
        key = (b["title"].strip().lower(), b["author"].strip().lower())
        if key not in seen:
            seen.add(key)
            out.append(b)
    return out


def main():
    print("Fetching currently-reading books from Supabase…")
    raw = fetch_reading_books()
    books = deduplicate(raw)

    data = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reading": [
            {
                "title":        b["title"].strip(),
                "author":       b["author"].strip(),
                "cover_url":    b.get("cover_url", "").strip(),
                "genre":        b.get("genre", "").strip(),
                "fiction_type": b.get("fiction_type", "").strip(),
            }
            for b in books
        ],
    }

    out = Path(__file__).parent.parent / "data" / "books.json"
    out.write_text(json.dumps(data, indent=2) + "\n")
    print(f"✅ {len(data['reading'])} books → {out}")


if __name__ == "__main__":
    main()
