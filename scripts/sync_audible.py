#!/usr/bin/env python3
"""
Sync Audible library → Supabase (Bookish database).

For each book in the Audible library:
  - If it already exists in Bookish (title+author match): add "audible" to its
    formats array if not already there. Status is NOT changed.
  - If it's new: insert it with format=["audible"] and status derived from
    Audible listening progress.

Run by GitHub Actions (see .github/workflows/sync-audible.yml).
Requires env var AUDIBLE_AUTH (base64-encoded audible_auth.json content).
"""

import os
import sys
import json
import base64
import re
import time
import random
import string
import tempfile
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
    import audible
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "audible", "-q"])
    import requests
    import audible

# ── Supabase config (anon key — same one the Bookish browser app uses) ─────────

SUPABASE_URL = "https://ouiczkqxcbqriiefixsh.supabase.co"
SUPABASE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91aWN6a3F4Y2JxcmlpZWZpeHNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MzY1OTgsImV4cCI6MjA4NDAxMjU5OH0"
    ".2YvZmVt1HPwtWc6z-oTeXn8pNb-PP5J6Des1yPl5vGE"
)
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# ── Audible → Bookish genre mapping ────────────────────────────────────────────

GENRE_MAP = {
    "science fiction": "Science Fiction",
    "fantasy": "Fantasy",
    "mystery": "Mystery",
    "thriller": "Thriller",
    "romance": "Romance",
    "literature": "Fiction",
    "literary fiction": "Fiction",
    "historical fiction": "Historical Fiction",
    "biography": "Biography/Memoir",
    "memoir": "Biography/Memoir",
    "history": "History",
    "science": "Science",
    "technology": "Science",
    "business": "Business",
    "economics": "Business",
    "self-help": "Self-Help",
    "psychology": "Psychology",
    "philosophy": "Philosophy",
    "politics": "Politics",
    "poetry": "Poetry",
    "health": "Health",
    "travel": "Travel",
    "religion": "Religion/Spirituality",
    "spirituality": "Religion/Spirituality",
    "art": "Art",
    "humor": "Humor",
    "sports": "Sports",
    "parenting": "Parenting",
    "cooking": "Food & Drink",
    "true crime": "True Crime",
}

FICTION_GENRES = {
    "Science Fiction", "Fantasy", "Mystery", "Thriller", "Romance",
    "Fiction", "Historical Fiction", "Horror", "Literary Fiction",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def generate_id():
    """Replicate Bookish's book-{timestamp}-{random} format."""
    ts = int(time.time() * 1000)
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=7))
    return f"book-{ts}-{rand}"


def map_genre(categories):
    """Best-effort genre mapping from Audible category list."""
    for cat in categories:
        name = cat.get("name", "").lower()
        for key, mapped in GENRE_MAP.items():
            if key in name:
                return mapped
    return "Uncategorized"


def listening_status_to_bookish(item):
    """Derive Bookish status from Audible listening data.
    Only "read" (finished) or "unread" — never "reading", which the user sets manually."""
    ls = item.get("listening_status") or {}
    if ls.get("is_finished"):
        return "read"
    return "unread"


def get_cover_url(item):
    images = item.get("product_images") or {}
    for size in ("500", "1215", "408", "252"):
        if size in images:
            return images[size]
    return ""


def get_author(item):
    authors = item.get("authors") or []
    names = [a.get("name", "") for a in authors if a.get("name")]
    return ", ".join(names) or "Unknown Author"


def strip_roles(author):
    """Remove translator/editor/narrator credits: ', Name - role' → ''"""
    return re.sub(r'[,;]\s+[^,;]+ - [A-Za-z].*?(?=[,;]\s+[^,;]+ - |$)', '', author).strip().rstrip(';,').strip()


def norm_for_lookup(s):
    """Normalize for matching: strip roles, unify author separators (; and ,), collapse whitespace/dots/credentials."""
    s = strip_roles(s)
    s = re.sub(r'\s+[A-Z]{2,4}(?=\s|$)', '', s)   # strip trailing credentials: USN, MD, PhD
    s = re.sub(r'\s+\(.*?\)', '', s)                # strip parenthetical: (trans.), (ed.)
    s = re.sub(r'[;,]+', ' ', s)                    # treat ; and , as equivalent author separators
    s = re.sub(r'[\s.]+', ' ', s)                   # collapse whitespace and dots
    return s.strip().lower()


# ── Supabase operations ────────────────────────────────────────────────────────

def fetch_all_books():
    """Return all books from Supabase as a list."""
    all_books = []
    offset = 0
    limit = 1000
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/bookslist",
            headers=HEADERS,
            params={"select": "id,title,author,formats,status", "limit": limit, "offset": offset},
        )
        r.raise_for_status()
        batch = r.json()
        all_books.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return all_books


def insert_book(book):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/bookslist",
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=book,
    )
    if not r.ok:
        raise RuntimeError(f"Insert failed ({r.status_code}): {r.text}")


def update_formats(book_id, new_formats):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/bookslist",
        headers={**HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{book_id}"},
        json={"formats": new_formats},
    )
    if not r.ok:
        raise RuntimeError(f"Update failed ({r.status_code}): {r.text}")


# ── Main ───────────────────────────────────────────────────────────────────────

def load_auth():
    """Load Audible auth from env var (base64) or local file."""
    raw = os.environ.get("AUDIBLE_AUTH")
    if raw:
        decoded = base64.b64decode(raw).decode()
        # Write to a temp file — audible library needs a file path
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        tmp.write(decoded)
        tmp.flush()
        return tmp.name
    # Fall back to local file for development
    local = Path(__file__).parent.parent / "audible_auth.json"
    if local.exists():
        return str(local)
    raise FileNotFoundError(
        "No Audible auth found. Set AUDIBLE_AUTH env var or run setup_audible_auth.py first."
    )


def main():
    print("=== Audible → Bookish sync ===\n")

    # 1. Authenticate with Audible
    auth_path = load_auth()
    auth = audible.Authenticator.from_file(auth_path)

    with audible.Client(auth=auth) as client:
        print("Fetching Audible library…")
        resp = client.get(
            "1.0/library",
            num_results=1000,
            response_groups=(
                "product_desc,product_attrs,"
                "media,listening_status,relationships"
            ),
        )

    items = resp.get("items", [])
    print(f"  → {len(items)} titles in Audible library\n")

    # 2. Fetch existing Bookish books
    print("Fetching existing Bookish records…")
    existing = fetch_all_books()
    # Build lookup: (norm_title, norm_author_stripped) → book record
    # norm_for_lookup strips roles (translators etc.) so Audible's extra credits don't cause false misses
    lookup = {
        (norm_for_lookup(b["title"]), norm_for_lookup(strip_roles(b["author"]))): b
        for b in existing
    }
    print(f"  → {len(existing)} books in Bookish\n")

    # 3. Sync
    inserted = 0
    updated = 0
    skipped = 0

    for item in items:
        title = (item.get("title") or "").strip()
        author = get_author(item)
        if not title or not author:
            continue

        key = (norm_for_lookup(title), norm_for_lookup(strip_roles(author)))
        existing_book = lookup.get(key)

        if existing_book:
            # Already in Bookish — ensure "audible" is in formats
            formats = existing_book.get("formats") or []
            if "audible" not in formats:
                new_formats = formats + ["audible"]
                update_formats(existing_book["id"], new_formats)
                print(f"  ↺  Updated formats: {title}")
                updated += 1
            else:
                skipped += 1
        else:
            # New book — insert
            categories = []
            for ladder in (item.get("category_ladders") or []):
                categories.extend(ladder.get("ladder", []))

            genre = map_genre(categories)
            fiction_type = "Fiction" if genre in FICTION_GENRES else "Nonfiction"
            status = listening_status_to_bookish(item)
            cover_url = get_cover_url(item)

            book = {
                "id":               generate_id(),
                "title":            title,
                "author":           author,
                "status":           status,
                "genre":            genre,
                "fiction_type":     fiction_type,
                "difficulty":       "Moderate",
                "formats":          ["audible"],
                "notes":            "",
                "isbn":             "",
                "publication_date": "",
                "acquired_date":    "",
                "cover_url":        cover_url,
                "added_at":         datetime.now(timezone.utc).isoformat(),
            }
            insert_book(book)
            print(f"  +  Inserted [{status}]: {title} — {author}")
            inserted += 1

    print(f"\n✅ Done: {inserted} inserted, {updated} formats updated, {skipped} already synced")


if __name__ == "__main__":
    main()
