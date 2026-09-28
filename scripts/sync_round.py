"""Importa automáticamente la próxima jornada elegible de Liga MX."""
import os
import json
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone

API_BASE = "https://v3.football.api-sports.io"

LEAGUE_ID = 262
SEASON = 2026
SEASON_NAME = "Apertura 2026"


def request(url, headers, body=None):
    data = None if body is None else json.dumps(body).encode()

    req = urllib.request.Request(
        url,
        headers=headers,
        data=data,
    )

    with urllib.request.urlopen(req, timeout=40) as response:
        return json.load(response)


def api_football(path, params):
    query = urllib.parse.urlencode(params)

    result = request(
        API_BASE + path + "?" + query,
        {
            "x-apisports-key": os.environ["API_FOOTBALL_KEY"]
        },
    )

    if result.get("errors"):
        raise RuntimeError(
            "API-Football rechazó la consulta: "
            + json.dumps(result["errors"])
        )

    return result.get("response", [])


def round_number(round_name):
    try:
        return int(round_name.rsplit("-", 1)[1].strip())
    except Exception:
        return None


def main():
    now = datetime.now(timezone.utc)

    # Buscamos partidos próximos sin tener que consultar
    # toda la temporada.
    fixtures = api_football(
        "/fixtures",
        {
            "league": LEAGUE_ID,
            "season": SEASON,
            "from": now.date().isoformat(),
            "to": (now + timedelta(days=21)).date().isoformat(),
        },
    )

    rounds = {}

    for item in fixtures:
        round_name = item["league"].get("round") or ""

        # Por ahora automatizamos solo Jornada regular.
        if not round_name.startswith("Regular Season"):
            continue

        rounds.setdefault(round_name, []).append(item)

    candidates = []

    for round_name, items in rounds.items():
        items.sort(key=lambda x: x["fixture"]["date"])

        first_kickoff = datetime.fromisoformat(
            items[0]["fixture"]["date"].replace("Z", "+00:00")
        )

        # Debe quedar más de 24 horas para permitir pronósticos.
        if first_kickoff <= now + timedelta(hours=24):
            continue

        candidates.append(
            (first_kickoff, round_name, items)
        )

    if not candidates:
        print("No hay una próxima jornada elegible en los siguientes 21 días.")
        return

    candidates.sort(key=lambda x: x[0])

    _, provider_round, items = candidates[0]

    number = round_number(provider_round)

    if number is None:
        raise RuntimeError(
            f"No se pudo obtener el número de jornada: {provider_round}"
        )

    matches = []

    for item in items:
        matches.append(
            {
                "home": item["teams"]["home"]["name"],
                "away": item["teams"]["away"]["name"],
                "kickoff": item["fixture"]["date"],
                "provider_id": item["fixture"]["id"],
            }
        )

    supabase_url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
    }

    result = request(
        supabase_url + "rpc/sync_round",
        headers,
        {
            "p_name": f"Jornada {number}",
            "p_season": SEASON_NAME,
            "p_stage": "Regular",
            "p_matches": matches,
        },
    )

    print(
        f"Jornada {number}: {len(matches)} partidos procesados. "
        f"Round ID: {result}"
    )


if __name__ == "__main__":
    main()
