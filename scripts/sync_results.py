"""Sincroniza resultados de los partidos registrados usando BSD."""
import os
import json
import urllib.request

BSD_BASE = "https://sports.bzzoiro.com/api/v2"


def request(url, headers, body=None):
    data = None if body is None else json.dumps(body).encode()

    req = urllib.request.Request(
        url,
        headers=headers,
        data=data,
    )

    with urllib.request.urlopen(req, timeout=40) as response:
        return json.load(response)


def normalize(item):
    status_map = {
        "upcoming": "scheduled",
        "live": "live",
        "finished": "finished",
        "cancelled": "cancelled",
        "postponed": "postponed",
    }

    status = status_map.get(item.get("status"))

    # BSD puede marcar unresolved cuando no puede confirmar qué pasó.
    # No adivinamos ese caso.
    if status is None:
        return None

    home = item.get("home_score")
    away = item.get("away_score")

    if status == "finished" and (home is None or away is None):
        return None

    return {
        "p_status": status,
        "p_home": home,
        "p_away": away,
        "p_kickoff": item["event_date"],
    }


def main():
    supabase_url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/"
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    bsd_key = os.environ["BSD_API_KEY"]

    supabase_headers = {
        "apikey": supabase_key,
        "Authorization": "Bearer " + supabase_key,
        "Content-Type": "application/json",
    }

    bsd_headers = {
        "Authorization": "Token " + bsd_key,
        "Accept": "application/json",
    }

    matches = request(
        supabase_url
        + "matches?select=id,provider_id"
        + "&provider_id=not.is.null"
        + "&manual_override=eq.false"
        + "&status=in.(scheduled,live,postponed)",
        supabase_headers,
    )

    updated = 0
    skipped = 0

    for match in matches:
        provider_id = match["provider_id"]

        item = request(
            f"{BSD_BASE}/events/{provider_id}/",
            bsd_headers,
        )

        update = normalize(item)

        if update is None:
            skipped += 1
            continue

        request(
            supabase_url + "rpc/sync_result",
            supabase_headers,
            {
                "p_id": match["id"],
                **update,
            },
        )

        updated += 1

    print(
        f"{updated} encuentros sincronizados. "
        f"{skipped} omitidos. "
        f"{len(matches)} partidos pendientes consultados."
    )


if __name__ == "__main__":
    main()
