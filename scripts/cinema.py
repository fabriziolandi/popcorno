#!/usr/bin/env python3
"""Orari dei cinema di oggi nei capoluoghi di provincia, da movieplayer.it.
Scrive data/cinema/<provincia>.json = {"citta","agg","sale":[{"n","ind","url","f":[{"t","o":["16:30",...]}]}]}
e data/cinema/index.json = {"<provincia>": {"n": "Nome", "sale": N, "film": N}}.
Uso: python3 scripts/cinema.py [cartella_uscita]"""
import os, re, sys, json, time, html, unicodedata, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo

OUT = sys.argv[1] if len(sys.argv) > 1 else "data/cinema"
BASE = "https://movieplayer.it"
UA = {"User-Agent": "Mozilla/5.0 (compatible; PopcornoBot/1.0; +https://popcorno.it/)", "Accept-Language": "it-IT,it;q=0.9"}
OGGI = datetime.now(ZoneInfo("Europe/Rome")).strftime("%Y-%m-%d")


def fetch(path):
    for i in range(3):
        try:
            req = urllib.request.Request(BASE + path, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if "404" in str(e): return ""
            time.sleep(2 + 3 * i)
    return ""


def tokens(raw):
    raw = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>|<!--[\s\S]*?-->", " ", raw)
    return [re.sub(r"\s+", " ", html.unescape(t)).strip() for t in re.split(r"<[^>]+>", raw) if t.strip()]


def slug(s):
    s = unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


RATING = re.compile(r"^(N/D|/5|\d(\.\d)?)$")
ORA = re.compile(r"^\d\d\.\d\d$")


def parse_cinema(raw):
    t = tokens(raw)
    title = re.search(r"<title>\s*(.*?)\s*-\s*Movieplayer", raw, re.S)
    name = html.unescape(title.group(1)).strip() if title else ""
    ind = next((x for x in t if re.search(r" - [^-]+ \([A-Z]{2}\)$", x) and len(x) < 120), "")
    films, cur = [], None
    for k, x in enumerate(t):
        if x == "VOTA":
            j = k - 1
            while j > 0 and RATING.match(t[j]): j -= 1
            cur = {"t": t[j], "o": []}; films.append(cur)
        elif x == "Boxoffice" and cur is not None:
            break
        elif cur is not None and ORA.match(x):
            o = x.replace(".", ":")
            if o not in cur["o"]: cur["o"].append(o)
    films = [f for f in films if f["o"]]
    return name, ind, films


def province():
    raw = fetch("/cinema/roma/")
    t = tokens(raw)
    nomi = {}
    if "Prov:" in t:
        for x in t[t.index("Prov:") + 1:]:
            if x.startswith("Città"): break
            if len(x) > 1: nomi[slug(x)] = x
    links = sorted(set(re.findall(r'href="/cinema/([a-z0-9-]+)/"', raw)))
    return [(s, nomi.get(s, s.replace("-", " ").title())) for s in links]


def city(item):
    s, nome = item
    raw = fetch(f"/cinema/{s}/")
    cl = sorted(set(re.findall(r'href="(/cinema/[a-z0-9-]+_\d+/)"', raw)))
    sale = []
    for c in cl:
        time.sleep(0.4)
        r = fetch(c)
        if not r: continue
        n, ind, f = parse_cinema(r)
        if f: sale.append({"n": n, "ind": ind, "url": BASE + c, "f": f})
    return s, nome, sale


def main():
    os.makedirs(OUT, exist_ok=True)
    prov = province()
    print("province:", len(prov), file=sys.stderr)
    index = {}
    with ThreadPoolExecutor(6) as ex:
        for s, nome, sale in ex.map(city, prov):
            if not sale: continue
            titoli = {f["t"] for x in sale for f in x["f"]}
            json.dump({"citta": nome, "agg": OGGI, "sale": sale}, open(os.path.join(OUT, s + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
            index[s] = {"n": nome, "sale": len(sale), "film": len(titoli)}
    json.dump({"agg": OGGI, "citta": index}, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print("citta con orari:", len(index), "sale:", sum(v["sale"] for v in index.values()), file=sys.stderr)
    if len(index) < 10: sys.exit(1)


if __name__ == "__main__":
    main()
