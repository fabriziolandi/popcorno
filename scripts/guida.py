#!/usr/bin/env python3
"""Legge la prima serata di OGGI (TV in chiaro, Sky, sport) da superguidatv.it,
la arricchisce con TMDB e scrive public/data/tv.json e public/data/meta.json.
Uso: TMDB_KEY=... python3 scripts/guida.py
Se trova meno di 15 programmi non scrive nulla ed esce con errore, cosi' il sito
tiene la guida precedente invece di una vuota."""
import os, re, sys, json, time, html, urllib.request, urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")
NOW = datetime.now(ROME)
BASE = "https://www.superguidatv.it"
UA = {"User-Agent": "Mozilla/5.0 (compatible; PopcornoBot/1.0; +https://fabriziolandi.github.io/popcorno/)",
      "Accept-Language": "it-IT,it;q=0.9"}
TMDB_KEY = os.environ.get("TMDB_KEY", "")

# ---------- canali ----------
DTT = {"Rai 1": "rai1", "Rai 2": "rai2", "Rai 3": "rai3", "Rete 4": "r4", "Canale 5": "c5", "Italia 1": "i1",
       "La7": "la7", "TV8": "tv8", "Nove": "nove", "20": "venti", "Rai 4": "rai4", "Iris": "iris", "Rai 5": "rai5",
       "Rai Movie": "raimovie", "Rai Premium": "raipremium", "Cielo": "cielo", "La 5": "la5", "Real Time": "realtime",
       "Cine34": "cine34", "Focus": "focus", "Giallo": "giallo", "Top Crime": "topcrime", "Boing": "boing",
       "Rai Gulp": "raigulp", "Rai Yoyo": "raiyoyo", "Cartoonito": "cartoonito", "Italia 2": "italia2", "DMAX": "dmax",
       "Rai Storia": "raistoria", "Rai Sport + HD": "raisport", "Rai Sport": "raisport"}
SKY = {108: "skyuno", 111: "skyatlantic", 112: "skyserie", 113: "skyinv", 115: "skycrime", 116: "history",
       117: "skydocs", 119: "skynature", 120: "skyarte", 301: "skycin1", 302: "skycin2", 303: "skycoll", 304: "skyfam",
       305: "skyact", 306: "skysus", 307: "skyrom", 308: "skydra", 309: "skycom", 310: "skycin24"}
NOMI = {v: k for k, v in DTT.items()}
NOMI.update({"skyuno": "Sky Uno", "skyatlantic": "Sky Atlantic", "skyserie": "Sky Serie", "skyinv": "Sky Investigation",
             "skycrime": "Sky Crime", "history": "History", "skydocs": "Sky Documentaries", "skynature": "Sky Nature",
             "skyarte": "Sky Arte", "skycin1": "Sky Cinema Uno", "skycin2": "Sky Cinema Due", "skycoll": "Sky Cinema Collection",
             "skyfam": "Sky Cinema Family", "skyact": "Sky Cinema Action", "skysus": "Sky Cinema Suspense",
             "skyrom": "Sky Cinema Romance", "skydra": "Sky Cinema Drama", "skycom": "Sky Cinema Comedy",
             "skycin24": "Sky Cinema Uno +24", "now": "Sky Sport", "dazn": "DAZN"})

# ---------- etichette di genere della guida ----------
FILM = {"Film"}
SERIE = {"Serie TV", "Telefilm", "Fiction", "Sit Com", "Soap Opera", "Miniserie", "Telenovela"}
KIDS = {"Ragazzi", "Cartoni Animati", "Cartoni", "Animazione"}
SPORT = {"Sport"}
SHOW = {"Intrattenimento": ("Intrattenimento", ["relax", "risate"], "🎤", ["#c31432", "#240b36"]),
        "Show": ("Intrattenimento", ["relax", "risate"], "🎤", ["#c31432", "#240b36"]),
        "Reality": ("Reality", ["relax", "risate"], "🏠", ["#ff512f", "#dd2476"]),
        "Quiz": ("Quiz", ["relax"], "❓", ["#f7971e", "#ffd200"]),
        "Talent Show": ("Talent", ["emozione", "relax"], "🎤", ["#c31432", "#240b36"]),
        "Documentario": ("Documentario", ["relax"], "🌍", ["#56ab2f", "#a8e063"]),
        "Mondo e Tendenze": ("Documentario", ["relax"], "🌍", ["#56ab2f", "#a8e063"]),
        "Crime e Mistero": ("Cronaca", ["tensione"], "🔎", ["#283048", "#859398"]),
        "LifeStyle": ("Lifestyle", ["relax"], "🍝", ["#ff9a9e", "#f6416c"]),
        "Musica": ("Musica", ["relax", "emozione"], "🎵", ["#c31432", "#240b36"])}

# ---------- generi TMDB (come tmdb.py) ----------
G = {28: ("Azione", ["tensione"], "💥", ["#cb2d3e", "#ef473a"]), 12: ("Avventura", ["emozione", "tensione"], "🗺️", ["#f7971e", "#c94b4b"]),
     16: ("Animazione", ["risate", "emozione"], "🎨", ["#56ccf2", "#2f80ed"]), 35: ("Commedia", ["risate", "relax"], "😂", ["#f7971e", "#ffd200"]),
     80: ("Crime", ["tensione"], "🕵️", ["#232526", "#414345"]), 99: ("Documentario", ["relax"], "🌍", ["#56ab2f", "#a8e063"]),
     18: ("Drammatico", ["emozione"], "🎭", ["#41295a", "#2f0743"]), 10751: ("Famiglia", ["risate", "relax"], "👨‍👩‍👧", ["#74ebd5", "#9face6"]),
     14: ("Fantasy", ["emozione", "tensione"], "🐉", ["#3a1c71", "#d76d77"]), 36: ("Storico", ["emozione"], "📜", ["#3e5151", "#decba4"]),
     27: ("Horror", ["tensione"], "👻", ["#1a0000", "#7a0000"]), 10402: ("Musicale", ["emozione", "relax"], "🎵", ["#c31432", "#240b36"]),
     9648: ("Mistero", ["tensione"], "🔎", ["#141e30", "#243b55"]), 10749: ("Romantico", ["emozione", "relax"], "💕", ["#a8577e", "#f1a7a1"]),
     878: ("Fantascienza", ["tensione", "emozione"], "🚀", ["#0f2027", "#2c5364"]), 53: ("Thriller", ["tensione"], "😬", ["#232526", "#5b5e49"]),
     10752: ("Guerra", ["tensione", "emozione"], "🎖️", ["#3a3a1c", "#6b6b3a"]), 37: ("Western", ["tensione"], "🤠", ["#8e5b2e", "#d9a35b"]),
     10759: ("Azione", ["tensione"], "💥", ["#cb2d3e", "#ef473a"]), 10762: ("Per bambini", ["risate", "relax"], "🧸", ["#56ccf2", "#2f80ed"]),
     10765: ("Fantascienza", ["tensione", "emozione"], "🚀", ["#0f2027", "#2c5364"]), 10764: ("Reality", ["relax", "risate"], "🏠", ["#ff512f", "#dd2476"]),
     10766: ("Soap", ["emozione", "relax"], "💌", ["#ee9ca7", "#ffdde1"]), 10768: ("Politica", ["tensione"], "🏛️", ["#283048", "#859398"])}
KIDG = {16, 10751, 10762}


def fetch(url):
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            print("errore", url, e, file=sys.stderr); time.sleep(2 + i * 3)
    return ""


def tokens(raw):
    raw = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>|<!--[\s\S]*?-->", " ", raw)
    return [html.unescape(t).strip() for t in re.split(r"<[^>]+>", raw) if t.strip()]


TIME = re.compile(r"^\d\d:\d\d$")


def blocks(toks, kind):
    """kind 'dtt': 'Stasera su', nome, 'Canale N', programmi. kind 'sky': 'Ch. N', 'Vedi Tutto', programmi.
    Restituisce {canale: [[ora, titolo, genere, extra], ...]}"""
    out, cur, i = {}, None, 0
    while i < len(toks):
        t = toks[i]
        if kind == "dtt" and t == "Stasera su" and i + 1 < len(toks):
            cur = toks[i + 1]; out.setdefault(cur, []); i += 2; continue
        if kind == "sky" and re.match(r"^Ch\. \d+$", t):
            cur = int(t[4:]); out.setdefault(cur, []); i += 1; continue
        if cur is not None and TIME.match(t) and i + 1 < len(toks):
            title = toks[i + 1]
            genre = toks[i + 2] if i + 2 < len(toks) and not TIME.match(toks[i + 2]) else ""
            j, extra = i + 3, []
            while j < len(toks) and not TIME.match(toks[j]) and toks[j] not in ("Stasera su", "Vedi Tutto") and not re.match(r"^Ch\. \d+$", toks[j]) and len(extra) < 3:
                extra.append(toks[j]); j += 1
            out[cur].append([t, title, genre, extra]); i = j; continue
        if cur is not None and t in ("Cosa vedere", "Seguici sui social"):
            cur = None
        i += 1
    return out


def mins(hm):
    h, m = map(int, hm.split(":")); return h * 60 + m + (24 * 60 if h < 5 else 0)


def pick(progs):
    """prima serata (inizio 20:25-22:15) e, se e' film o serie, il programma dopo (seconda serata).
    Lo stesso titolo ripetuto sullo stesso canale (episodi di fila) vale una volta sola."""
    res, titles = [], set()
    for k, (t, title, genre, extra) in enumerate(progs):
        nxt = progs[k + 1][0] if k + 1 < len(progs) else None
        dur = (mins(nxt) - mins(t)) if nxt else 0
        start = mins(t)
        prima = 20 * 60 + 25 <= start <= 22 * 60 + 15
        seconda = res and 22 * 60 + 15 < start <= 24 * 60 + 15 and genre in FILM | SERIE
        if (prima or seconda) and title.lower() not in titles:
            titles.add(title.lower()); res.append((t, title, genre, extra, dur))
    return res


_tm = {}


def tmdb(kind, title):
    if not TMDB_KEY: return None
    key = (kind, title.lower())
    if key in _tm: return _tm[key]
    q = urllib.parse.urlencode({"api_key": TMDB_KEY, "language": "it-IT", "query": title})
    try:
        with urllib.request.urlopen(f"https://api.themoviedb.org/3/search/{kind}?{q}", timeout=20) as r:
            res = json.load(r).get("results", [])
    except Exception:
        res = []
    low = title.lower()
    best = next((r for r in res if (r.get("title") or r.get("name") or "").lower() == low and r.get("vote_count", 0) >= 5), None) \
        or next((r for r in res if (r.get("original_title") or r.get("original_name") or "").lower() == low), None) \
        or next((r for r in res[:3] if r.get("vote_count", 0) >= 50), None)
    _tm[key] = best
    return best


def short(t, n=170):
    t = (t or "").strip().replace("\n", " ")
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0] + "…"


def make(src, t, title, genre, extra, dur):
    title = re.sub(r"\s*\(Diretta\)\s*$", "", title).strip()
    ep = next((x for x in extra if re.match(r"^Stagione \d+", x)), "")
    prima_tv = "Prima TV" in extra
    canale = NOMI.get(src, src)
    if genre in FILM:
        ty, kind = "film", "movie"
    elif genre in SERIE or genre in KIDS:
        ty, kind = "serie", "tv"
    elif genre in SHOW:
        ty, kind = "show", None
    else:
        return None
    it = {"t": title, "ty": ty, "s": src, "time": t, "dur": dur or {"film": 110, "serie": 50, "show": 110}[ty]}
    if kind:
        r = tmdb(kind, title)
        gids = (r or {}).get("genre_ids", [])
        g = next((G[x] for x in gids if x in G), ("Drammatico" if ty == "film" else "Serie", ["emozione"], "🎬" if ty == "film" else "📺", ["#614385", "#516395"]))
        kids = genre in KIDS or (bool(set(gids) & KIDG) and 27 not in gids)
        it.update({"m": g[1], "g": "Cartoni" if genre in KIDS and not gids else g[0], "e": g[2], "c": g[3]})
        if kids:
            it["kids"] = 1; it["w"] = ["famiglia"] if genre in KIDS else ["famiglia", "coppia", "amici"]
        else:
            it["w"] = ["solo", "coppia"] if g[0] in ("Horror", "Thriller", "Crime") else ["solo", "coppia", "amici"]
        if r:
            it.update({"v": round(r.get("vote_average", 0), 1) if r.get("vote_count", 0) >= 10 else 0, "vc": r.get("vote_count", 0), "l": r.get("original_language") or "",
                       "gs": gids[:3], "y": (r.get("release_date") or r.get("first_air_date") or "")[:4],
                       "p": r.get("poster_path") or "", "tmdb": f"{kind}/{r['id']}"})
            d = short(r.get("overview"))
        else:
            d = ""
        lead = ("Prima TV. " if prima_tv else "") + (ep + ". " if ep else "")
        it["d"] = (lead + d).strip() or f"{'Film' if ty == 'film' else 'Serie'} in prima serata su {canale}."
    else:
        g = SHOW[genre]
        it.update({"m": g[1], "w": ["famiglia", "coppia", "solo"], "g": g[0], "e": g[2], "c": g[3],
                   "d": ("Prima TV. " if prima_tv else "") + f"{g[0]} in prima serata su {canale}."})
    return it


# ---------- sport ----------
SKIP_SPORT = re.compile(r"Paddock|Studio|Show|Highlights|Today|Talk|Sport ?24|Diretta Gol|\bPre\b|\bPost\b|Magazine|Kampione|Saturday Night|Sunday|Calcio Show|Club|Speciale|Replica|Conf\. Stampa|Buffa", re.I)
COMP = r"(Nations|Serie A|Serie B|Serie C|Champions League|Europa League|Conference League|Premier League|LaLiga|Liga|Bundesliga|Ligue 1|Eurolega|EuroCup|NBA|Coppa Italia|UEFA[\w ]*|ATP[\w ]*|WTA[\w ]*|Nations League)"


def sport_item(src, t, title):
    clean = re.sub(r"\s*\(Diretta\)\s*$", "", title).replace("...", "").strip()
    if SKIP_SPORT.search(clean): return None
    is_match = " - " in clean
    is_motor = re.search(r"\b(GP|Gara|Qualifiche|Sprint)\b", clean)
    if not (is_match or is_motor): return None
    teams, comp = [], ""
    m = re.match(r"^(.+?) - (.+?)(?: " + COMP + r")?$", clean)
    if is_match and m:
        teams = [m.group(1).strip(), m.group(2).strip()]; comp = m.group(3) or ""
    if comp in ("Serie A",) or "Serie A" in clean:
        src_main, also = "dazn", (["now"] if src == "now" else [])
    else:
        src_main, also = src, []
    CALCIO = ("Serie A", "Serie B", "Serie C", "Champions League", "Europa League", "Conference League", "Premier League", "LaLiga", "Liga", "Bundesliga", "Ligue 1", "Coppa Italia")
    if is_motor and not is_match: g = "Motori"
    elif comp in CALCIO: g = "Calcio"
    elif comp in ("Eurolega", "EuroCup", "NBA"): g = "Basket"
    elif re.search(r"Nations|Rugby|Sei Nazioni", clean): g = "Rugby"
    elif comp.startswith(("ATP", "WTA")): g = "Tennis"
    else: g = "Sport"
    if g == "Sport" and teams and not re.match(r"^[A-ZÀ-Ý][\w'.]+( [A-ZÀ-Ý][\w'.]+){0,3}$", teams[0]): return None
    e = {"Motori": "🏎️", "Calcio": "⚽", "Basket": "🏀", "Rugby": "🏉", "Tennis": "🎾"}.get(g, "🏟️")
    if comp == "Nations": comp = "Rugby"
    teams = [re.sub(r"\s+(Nations|Rugby)$", "", x) for x in teams]
    nome = (comp + " · " if comp else "") + (" - ".join(teams) if teams else clean)
    it = {"t": nome, "ty": "sport", "s": src_main, "time": t, "dur": 110, "m": ["sport"], "w": ["amici", "solo", "coppia"],
          "g": g, "e": e, "c": ["#0b8793", "#360033"], "d": "In diretta su " + " e ".join(NOMI.get(x, x) for x in [src_main] + also) + "."}
    if also: it["also"] = also
    if teams: it["teams"] = teams
    return it


def main():
    items, sport, seen = [], [], set()
    # TV in chiaro
    dtt = blocks(tokens(fetch(BASE + "/serata/")), "dtt")
    for name, progs in dtt.items():
        src = DTT.get(name)
        if not src: continue
        for t, title, genre, extra, dur in pick(progs):
            if genre in SPORT:
                s = sport_item(src, t, title)
                if s: sport.append(s)
                continue
            it = make(src, t, title, genre, extra, dur)
            if it: items.append(it)
    # Sky: cinema, intrattenimento, documentari
    for page in ("sky-cinema", "sky-intrattenimento", "sky-doc-e-lifestyle"):
        for ch, progs in blocks(tokens(fetch(f"{BASE}/serata/oggi/{page}/")), "sky").items():
            src = SKY.get(ch)
            if not src: continue
            for t, title, genre, extra, dur in pick(progs):
                key = title.lower()
                dup = next((x for x in items if x["t"].lower() == key and x["s"].startswith("sky")), None)
                if dup:
                    if src != dup["s"]: dup.setdefault("also", []).append(src)
                    continue
                it = make(src, t, title, genre, extra, dur)
                if it: items.append(it)
    # Sport: Sky Sport e DAZN (orari 19:30-22:30)
    for page, src in (("sky-sport", "now"), ("dazn", "dazn")):
        bl = blocks(tokens(fetch(f"{BASE}/serata/oggi/{page}/")), "sky")
        progs = [p for v in bl.values() for p in v]
        if not progs:  # pagina DAZN senza blocchi "Ch."
            raw = tokens(fetch(f"{BASE}/serata/oggi/{page}/"))
            progs = [[raw[i], raw[i + 1], raw[i + 2] if i + 2 < len(raw) else "", []] for i in range(len(raw) - 1) if TIME.match(raw[i])]
        for t, title, genre, extra in progs:
            if 19 * 60 + 30 <= mins(t) <= 22 * 60 + 30:
                s = sport_item(src, t, title)
                if s: sport.append(s)
    for s in sport:
        k = s["t"].lower()
        if k in seen:
            prev = next(x for x in items if x["t"].lower() == k)
            for a in [s["s"]] + s.get("also", []):
                if a != prev["s"] and a not in prev.setdefault("also", []): prev["also"].append(a)
            continue
        seen.add(k); items.append(s)
    for x in items:
        if "also" in x and not x["also"]: del x["also"]

    print(f"guida: {len(items)} programmi ({sum(1 for x in items if x['ty']=='sport')} sport)", file=sys.stderr)
    if len(items) < 15:
        print("troppo pochi programmi: tengo la guida precedente", file=sys.stderr); sys.exit(1)
    mesi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
    giorni = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
    meta = {"data": NOW.strftime("%Y-%m-%d"), "etichetta": f"{giorni[NOW.weekday()]} {NOW.day} {mesi[NOW.month-1]}",
            "aggiornato": f"{NOW.day} {mesi[NOW.month-1]}, {NOW.strftime('%H:%M')}",
            "fonti": ["superguidatv.it", "github.com/matthuisman/i.mjh.nz (Pluto TV, Samsung TV Plus)"]}
    os.makedirs("data", exist_ok=True)
    json.dump(items, open("public/data/tv.json", "w"), ensure_ascii=False, indent=0)
    json.dump(meta, open("public/data/meta.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
