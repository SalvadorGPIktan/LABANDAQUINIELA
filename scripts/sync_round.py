import os
import json
import urllib.request
import urllib.parse

BASE = "https://sports.bzzoiro.com/api/v2"
LEAGUE_ID = 19


def get(path, params=None):
    url = BASE + path

    if params:
        url += "?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(
        url,
        headers={
            "Authorization": "Token " + os.environ["BSD_API_KEY"],
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(req, timeout=40) as response:
        return json.load(response)


def main():
    # 1. Obtener temporada actual de Liga MX
    season = get(f"/leagues/{LEAGUE_ID}/season/")

    print("=== TEMPORADA ACTUAL ===")
    print(json.dumps(season, indent=2, ensure_ascii=False))

    season_id = season["season"]["id"]

    # 2. Obtener próximos partidos
    events = get(
        "/events/",
        {
            "league_id": LEAGUE_ID,
            "season_id": season_id,
            "status": "upcoming",
            "limit": 20,
        },
    )

    print("\n=== CLAVES RESPUESTA EVENTS ===")
    print(events.keys())

    print("\n=== PRIMER PARTIDO ===")

    results = events.get("results", [])

    if results:
        print(json.dumps(results[0], indent=2, ensure_ascii=False))
    else:
        print("No llegaron partidos próximos.")


if __name__ == "__main__":
    main()
