"""Importa automáticamente la próxima jornada completa de Liga MX desde BSD."""
import os
import json
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone

BSD_BASE = "https://sports.bzzoiro.com/api/v2"
LEAGUE_ID = 19


def request(url, headers, body=None):
    data = None if body is None else json.dumps(body).encode()

    req = urllib.request.Request(
        url,
        headers=headers,
        data=data,
    )

    with urllib.request.urlopen(req, timeout=40) as response:
        return json.load(response)


def bsd_get(path, params=None):
    url = BSD_BASE + path

    if params:
        url += "?" + urllib.parse.urlencode(params)

    return request(
        url,
        {
            "Authorization": "Token " + os.environ["BSD_API_KEY"],
            "Accept": "application/json",
        },
    )


def parse_date(value):
    return datetime.fromisoformat(
        value.replace("Z", "+00:00")
    )


def is_upcoming(status):
    # BSD actualmente puede devolver "notstarted",
    # aunque su documentación también usa "upcoming".
    return status in {
        "upcoming",
        "notstarted",
        "scheduled",
        "not_started",
    }


def main():
    now = datetime.now(timezone.utc)

    # 1. Obtener automáticamente la temporada actual.
    season_response = bsd_get(
        f"/leagues/{LEAGUE_ID}/season/"
    )

    season = season_response["season"]
    season_id = season["id"]

    # "Liga MX, Apertura 2026" -> "Apertura 2026"
    season_name = season.get("name", "Liga MX")

    if "," in season_name:
        season_name = season_name.split(",", 1)[1].strip()

    print(
        f"Temporada detectada: {season_name} "
        f"(season_id={season_id})"
    )

    # 2. Traer TODOS los partidos de fase regular.
    # Liga MX cabe completa dentro del máximo de 200 resultados.
    response = bsd_get(
        "/events/",
        {
            "league_id": LEAGUE_ID,
            "season_id": season_id,
            "stage": "regular-season",
            "limit": 200,
        },
    )

    events = response.get("results", [])

    print(f"{len(events)} partidos de fase regular recibidos.")

    # 3. Agrupar por número de jornada.
    rounds = {}

    for event in events:
        number = event.get("round_number")

        if number is None:
            continue

        rounds.setdefault(int(number), []).append(event)

    candidates = []

    for number, items in rounds.items():
        if not items:
            continue

        # No queremos importar una jornada que ya empezó.
        if not all(is_upcoming(x.get("status")) for x in items):
            continue

        items.sort(key=lambda x: x["event_date"])

        first_kickoff = parse_date(items[0]["event_date"])

        # La quiniela cierra 24 horas antes del primer encuentro.
        if first_kickoff <= now + timedelta(hours=24):
            continue

        candidates.append(
            (
                first_kickoff,
                number,
                items,
            )
        )

    if not candidates:
        print(
            "No hay una jornada completa futura "
            "con más de 24 horas disponibles."
        )
        return

    # La jornada completamente futura más cercana.
    candidates.sort(key=lambda x: x[0])

    first_kickoff, round_number, items = candidates[0]

    print(
        f"Próxima jornada: {round_number} | "
        f"{len(items)} partidos | "
        f"primer partido: {first_kickoff.isoformat()}"
    )

    # 4. Convertir los partidos al formato de nuestra BD.
    matches = []

    for item in items:
        matches.append(
            {
                "home": item["home_team"],
                "away": item["away_team"],
                "kickoff": item["event_date"],
                "provider_id": item["id"],
            }
        )

    # 5. Guardar jornada + partidos en Supabase.
    supabase_url = (
        os.environ["SUPABASE_URL"].rstrip("/")
        + "/rest/v1/"
    )

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
            "p_name": f"Jornada {round_number}",
            "p_season": season_name,
            "p_stage": "Regular",
            "p_matches": matches,
        },
    )

    print(
        f"Jornada {round_number} importada: "
        f"{len(matches)} partidos. "
        f"Round ID: {result}"
    )


if __name__ == "__main__":
    main()
