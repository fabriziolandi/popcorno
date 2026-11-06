#!/usr/bin/env python3
"""Catalogo on demand per l'Italia da TMDB + voti per i film in TV.
Uso: TMDB_KEY=... python3 tmdb.py palinsesto_items.json > tmdb.json
palinsesto_items.json = lista degli item TV (puo' essere [] ); l'output e'
{"ondemand":[...], "voti":{"<titolo>":{"v":7.1,"y":2001}}}"""
import os, sys, json, time, urllib.request, urllib.parse
from datetime import date, timedelta

K = os.environ["TMDB_KEY"]
def get(path, **q):
    q.update(api_key=K, language="it-IT")
    url = "https://api.themoviedb.org/3" + path + "?" + urllib.parse.urlencode(q)
    for _ in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r: return json.load(r)
        except Exception: time.sleep(1)
    return {}

# chiave app -> (id TMDB, tipo di offerta)
PROV = {"netflix":(8,"flatrate"), "prime":(119,"flatrate"), "disney":(337,"flatrate"), "hbo":(1899,"flatrate"),
        "apple":(350,"flatrate"), "paramount":(531,"flatrate"), "now":(39,"flatrate"),
        "raiplay":(222,"free|ads|flatrate"), "infinity":(359,"free|ads|flatrate"), "pluto":(300,"free|ads"), "rakuten":(35,"free|ads")}
FREE = {"raiplay","infinity","pluto","rakuten"}

# genere TMDB -> (nome, umori, emoji, colori)
G = {28:("Azione",["tensione"],"💥",["#cb2d3e","#ef473a"]), 12:("Avventura",["emozione","tensione"],"🗺️",["#f7971e","#c94b4b"]),
     16:("Animazione",["risate","emozione"],"🎨",["#56ccf2","#2f80ed"]), 35:("Commedia",["risate","relax"],"😂",["#f7971e","#ffd200"]),
     80:("Crime",["tensione"],"🕵️",["#232526","#414345"]), 99:("Documentario",["relax"],"🌍",["#56ab2f","#a8e063"]),
     18:("Drammatico",["emozione"],"🎭",["#41295a","#2f0743"]), 10751:("Famiglia",["risate","relax"],"👨‍👩‍👧",["#74ebd5","#9face6"]),
     14:("Fantasy",["emozione","tensione"],"🐉",["#3a1c71","#d76d77"]), 36:("Storico",["emozione"],"📜",["#3e5151","#decba4"]),
     27:("Horror",["tensione"],"👻",["#1a0000","#7a0000"]), 10402:("Musicale",["emozione","relax"],"🎵",["#c31432","#240b36"]),
     9648:("Mistero",["tensione"],"🔎",["#141e30","#243b55"]), 10749:("Romantico",["emozione","relax"],"💕",["#a8577e","#f1a7a1"]),
     878:("Fantascienza",["tensione","emozione"],"🚀",["#0f2027","#2c5364"]), 53:("Thriller",["tensione"],"😬",["#232526","#5b5e49"]),
     10752:("Guerra",["tensione","emozione"],"🎖️",["#3a3a1c","#6b6b3a"]), 37:("Western",["tensione"],"🤠",["#8e5b2e","#d9a35b"]),
     10759:("Azione",["tensione"],"💥",["#cb2d3e","#ef473a"]), 10762:("Per bambini",["risate","relax"],"🧸",["#56ccf2","#2f80ed"]),
     10765:("Fantascienza",["tensione","emozione"],"🚀",["#0f2027","#2c5364"]), 10764:("Reality",["relax","risate"],"🏠",["#ff512f","#dd2476"]),
     10766:("Soap",["emozione","relax"],"💌",["#ee9ca7","#ffdde1"]), 10768:("Politica",["tensione"],"🏛️",["#283048","#859398"])}
KIDS = {16, 10751, 10762}

def short(t, n=170):
    t = (t or "").strip().replace("\n", " ")
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0] + "…"

today = date.today()
recent = (today - timedelta(days=150)).isoformat()
found = {}  # (kind,id) -> item

def add(kind, r, key, nuovo=False):
    k = (kind, r["id"])
    if k in found:
        it = found[k]
        if key != it["s"] and key not in it.setdefault("also", []): it["also"].append(key)
        if nuovo: it["nuovo"] = 1
        return
    gids = r.get("genre_ids", [])
    g = next((G[x] for x in gids if x in G), ("Varie", ["relax"], "🎬", ["#614385", "#516395"]))
    kids = bool(set(gids) & KIDS) and 27 not in gids and 53 not in gids
    w = ["famiglia", "coppia", "amici"] if kids else (["solo", "coppia"] if g[0] in ("Horror", "Thriller", "Crime") else ["solo", "coppia", "amici"])
    title = r.get("title") or r.get("name") or ""
    y = (r.get("release_date") or r.get("first_air_date") or "")[:4]
    it = {"t": title, "ty": "film" if kind == "movie" else "serie", "s": key, "dur": 0, "m": g[1], "w": w,
          "g": g[0], "e": g[2], "c": g[3], "d": short(r.get("overview")) or f"{'Film' if kind=='movie' else 'Serie'} del {y}.",
          "v": round(r.get("vote_average", 0), 1), "y": y, "tmdb": f"{kind}/{r['id']}", "p": r.get("poster_path") or ""}
    if kids: it["kids"] = 1
    if nuovo: it["nuovo"] = 1
    found[k] = it

for key, (pid, mon) in PROV.items():
    base = dict(watch_region="IT", with_watch_providers=pid, with_watch_monetization_types=mon, sort_by="popularity.desc")
    n = 4 if key in FREE else 6
    for r in get("/discover/movie", **base, **{"vote_count.gte": 150}).get("results", [])[:n]: add("movie", r, key)
    for r in get("/discover/tv", **base, **{"vote_count.gte": 80}).get("results", [])[:n]: add("tv", r, key)
    for r in get("/discover/movie", **base, **{"primary_release_date.gte": recent, "vote_count.gte": 20}).get("results", [])[:2]: add("movie", r, key, True)
    for r in get("/discover/tv", **base, **{"first_air_date.gte": recent, "vote_count.gte": 10}).get("results", [])[:2]: add("tv", r, key, True)

for (kind, i), it in found.items():
    d = get(f"/{kind}/{i}")
    if kind == "movie": it["dur"] = d.get("runtime") or 100
    else:
        ert = d.get("episode_run_time") or []
        it["dur"] = ert[0] if ert else (d.get("last_episode_to_air") or {}).get("runtime") or 45

# film nelle sale italiane (now_playing, regione IT)
cinema, seen_c = [], set()
for page in (1, 2, 3):
    for r in get("/movie/now_playing", region="IT", page=page).get("results", []):
        if r["id"] in seen_c: continue
        seen_c.add(r["id"])
        gids = r.get("genre_ids", [])
        g = next((G[x] for x in gids if x in G), ("Varie", ["relax"], "🎬", ["#614385", "#516395"]))
        kids = bool(set(gids) & KIDS) and 27 not in gids and 53 not in gids
        rel = r.get("release_date") or ""
        it = {"t": r.get("title", ""), "ty": "cinema", "s": "cinema", "dur": 0, "m": g[1],
              "w": ["famiglia", "coppia", "amici"] if kids else ["solo", "coppia", "amici"],
              "g": g[0], "e": g[2], "c": g[3], "d": short(r.get("overview")) or "In sala ora.",
              "v": round(r.get("vote_average", 0), 1), "y": rel[:4], "uscita": rel, "pop": round(r.get("popularity", 0)),
              "tmdb": f"movie/{r['id']}", "p": r.get("poster_path") or ""}
        if kids: it["kids"] = 1
        if rel and rel >= (today - timedelta(days=10)).isoformat(): it["nuovo"] = 1
        cinema.append(it)
cinema.sort(key=lambda x: -x["pop"])
cinema = cinema[:50]
for it in cinema:
    it["dur"] = get("/" + it["tmdb"]).get("runtime") or 110

# voti per i film in TV
voti = {}
tv_items = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else []
for t in [x["t"] for x in tv_items if x.get("ty") == "film"]:
    res = get("/search/movie", query=t).get("results", [])
    m = next((r for r in res if r.get("title", "").lower() == t.lower() and r.get("vote_count", 0) >= 20), None)
    if m: voti[t] = {"v": round(m["vote_average"], 1), "y": (m.get("release_date") or "")[:4], "p": m.get("poster_path") or "", "tmdb": f"movie/{m['id']}"}

print(json.dumps({"ondemand": list(found.values()), "cinema": cinema, "voti": voti}, ensure_ascii=False))
