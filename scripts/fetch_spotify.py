#!/usr/bin/env python3
"""
Fetch Spotify top tracks and top artists, write to data/spotify.json.
Run by GitHub Actions on a schedule (see .github/workflows/update-spotify.yml).

Requires env vars:
    SPOTIFY_CLIENT_ID
    SPOTIFY_CLIENT_SECRET
    SPOTIFY_REFRESH_TOKEN
"""

import os
import json
import base64
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

CLIENT_ID     = os.environ["SPOTIFY_CLIENT_ID"]
CLIENT_SECRET = os.environ["SPOTIFY_CLIENT_SECRET"]
REFRESH_TOKEN = os.environ["SPOTIFY_REFRESH_TOKEN"]

API = "https://api.spotify.com/v1"


def get_access_token():
    creds = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    r = requests.post(
        "https://accounts.spotify.com/api/token",
        headers={"Authorization": f"Basic {creds}"},
        data={"grant_type": "refresh_token", "refresh_token": REFRESH_TOKEN},
    )
    r.raise_for_status()
    return r.json()["access_token"]


def get(path, token, params=None):
    r = requests.get(
        f"{API}{path}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
    )
    r.raise_for_status()
    return r.json()


def best_image(images, target_width=300):
    """Pick the image closest to target_width without going under, or the smallest available."""
    if not images:
        return None
    above = [i for i in images if i.get("width", 0) >= target_width]
    if above:
        return min(above, key=lambda i: i["width"])["url"]
    return min(images, key=lambda i: i.get("width", 9999))["url"]


def main():
    print("Fetching Spotify data…")
    token = get_access_token()

    # Top tracks — last ~4 weeks
    raw_tracks = get("/me/top/tracks", token, {"time_range": "short_term", "limit": 8})
    top_tracks = [
        {
            "name":   t["name"],
            "artist": ", ".join(a["name"] for a in t["artists"]),
            "album":  t["album"]["name"],
            "image":  best_image(t["album"]["images"]),
            "url":    t["external_urls"]["spotify"],
        }
        for t in raw_tracks.get("items", [])
    ]

    # Top artists — last ~4 weeks
    raw_artists = get("/me/top/artists", token, {"time_range": "short_term", "limit": 6})
    top_artists = [
        {
            "name":   a["name"],
            "image":  best_image(a["images"]),
            "genres": a.get("genres", [])[:2],
            "url":    a["external_urls"]["spotify"],
        }
        for a in raw_artists.get("items", [])
    ]

    data = {
        "updated_at":  datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "top_tracks":  top_tracks,
        "top_artists": top_artists,
    }

    out = Path(__file__).parent.parent / "data" / "spotify.json"
    out.write_text(json.dumps(data, indent=2) + "\n")
    print(f"✅ {len(top_tracks)} tracks, {len(top_artists)} artists → {out}")


if __name__ == "__main__":
    main()
