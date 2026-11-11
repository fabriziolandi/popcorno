#!/usr/bin/env python3
"""Catalogo COMPLETO per l'Italia di ogni piattaforma streaming, da TMDB.
Scrive public/data/catalogo/<chiave>.json in formato compatto:
{"k":"netflix","agg":"AAAA-MM-GG","t":[[id,tipo,titolo,anno,voto,generi,popolarita,poster,numero_voti,lingua_originale], ...]; trame in public/data/trame/<id%100>.json}
tipo: 0 film, 1 serie. Uso: TMDB_KEY=... python3 scripts/catalogo.py [cartella_uscita]"""
import re, os, sys, json, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import date

K = os.environ["TMDB_KEY"]
OUT = sys.argv[1] if len(sys.argv) > 1 else "public/data/catalogo"
os.makedirs(OUT, exist_ok=True)

PROV = {"netflix": (8, "flatrate"), "prime": (119, "flatrate"), "disney": (337, "flatrate"), "hbo": (1899, "flatrate"),
        "apple": (350, "flatrate"), "paramount": (531, "flatrate"), "now": (39, "flatrate"),
        "raiplay": (222, "free|ads|flatrate"), "infinity": (359, "free|ads|flatrate"),
        "pluto": (300, "free|ads"), "rakuten": (35, "free|ads"), "mubi": (11, "flatrate")}
# Servizi cercati per nome tra le piattaforme TMDB in Italia (codice non fisso): se TMDB non ne
# ha uno, quel catalogo si salta e l'app va avanti senza.
PROV_NOME = {"timvision": (r"^timvision$", "flatrate"), "crunchyroll": (r"^crunchyroll$", "flatrate"),
             "infinityplus": (r"infinity\s*(\+|plus)", "flatrate")}

def get(path, **q):
    q.update(api_key=K, language="it-IT")
    url = "https://api.themoviedb.org/3" + path + "?" + urllib.parse.urlencode(q)
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=25) as r: return json.load(r)
        except Exception:
            time.sleep(1 + i)
    return {}

def short(t, n=160):
    t = (t or "").strip().replace("\n", " ")
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0] + "…"

def row(kind, r):
    return [r["id"], 0 if kind == "movie" else 1, r.get("title") or r.get("name") or "",
            (r.get("release_date") or r.get("first_air_date") or "")[:4], round(r.get("vote_average", 0), 1),
            r.get("genre_ids", [])[:3], round(r.get("popularity", 0)), r.get("poster_path") or "", short(r.get("overview")), r.get("vote_count", 0), r.get("original_language") or ""]

def fetch(key, kind):
    pid, mon = PROV[key]
    base = dict(watch_region="IT", with_watch_providers=pid, with_watch_monetization_types=mon,
                sort_by="popularity.desc", include_adult="false")
    first = get(f"/discover/{kind}", page=1, **base)
    pages = min(first.get("total_pages", 0), 500)
    res = list(first.get("results", []))
    with ThreadPoolExecutor(8) as ex:
        for d in ex.map(lambda p: get(f"/discover/{kind}", page=p, **base), range(2, pages + 1)):
            res += d.get("results", [])
    return [row(kind, r) for r in res if (r.get("title") or r.get("name"))]

def providers():
    nomi = {}
    for kind in ("movie", "tv"):
        for r in get(f"/watch/providers/{kind}", watch_region="IT").get("results", []):
            nomi[r["provider_name"]] = r["provider_id"]
    return nomi

nomi = providers()
for n, i in sorted(nomi.items()):
    if re.search(r"tim|crunchy|infinity|mediaset|discovery", n, re.I): print("TMDB IT:", i, n, file=sys.stderr)
for key, (rx, mon) in PROV_NOME.items():
    trovati = [i for n, i in nomi.items() if re.search(rx, n.strip(), re.I)]
    if len(trovati) == 1 and trovati[0] not in {v[0] for v in PROV.values()}: PROV[key] = (trovati[0], mon)
    else: print("catalogo", key, "saltato: piattaforme TMDB trovate", trovati, file=sys.stderr)

tot, trame = 0, {}
for key in PROV:
    rows, seen = [], set()
    for kind in ("movie", "tv"):
        for r in fetch(key, kind):
            if (r[0], r[1]) in seen: continue
            seen.add((r[0], r[1])); rows.append(r)
    rows.sort(key=lambda r: -r[6])
    for r in rows:
        if r[8]: trame[("m" if r[1] == 0 else "t") + str(r[0])] = r[8]
    rows = [r[:8] + [r[9], r[10]] for r in rows]
    with open(os.path.join(OUT, key + ".json"), "w") as f:
        json.dump({"k": key, "agg": date.today().isoformat(), "t": rows}, f, ensure_ascii=False, separators=(",", ":"))
    tot += len(rows)
    print(key, len(rows), file=sys.stderr)
# trame divise in 100 file piccoli: public/data/trame/<id % 100>.json
TD = os.path.join(os.path.dirname(OUT.rstrip("/")) or ".", "trame")
os.makedirs(TD, exist_ok=True)
buckets = {}
for k, v in trame.items(): buckets.setdefault(int(k[1:]) % 100, {})[k] = v
for b in range(100):
    with open(os.path.join(TD, f"{b}.json"), "w") as f: json.dump(buckets.get(b, {}), f, ensure_ascii=False, separators=(",", ":"))
print("totale", tot, "trame", len(trame), file=sys.stderr)
