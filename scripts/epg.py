#!/usr/bin/env python3
"""Estrae la prima serata di Pluto TV e Samsung TV Plus (Italia) dalle guide XMLTV
di github.com/matthuisman/i.mjh.nz e stampa gli item in JSON per palinsesto.js.
Uso: python3 epg.py AAAA-MM-GG pluto.xml samsung.xml > fast.json"""
import sys, json, re, xml.etree.ElementTree as ET
from datetime import datetime
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")
day = sys.argv[1]
d0 = datetime.fromisoformat(day + "T20:30:00").replace(tzinfo=ROME)
d1 = datetime.fromisoformat(day + "T22:30:00").replace(tzinfo=ROME)

GEN = [  # (parole chiave in categorie o nome canale, genere, umori, colori, emoji)
  (r"horror|paura|brivid|streghe", "Horror", ["tensione"], ["#1a0000", "#7a0000"], "👻"),
  (r"thriller|crime|crim|giall|detect|polizi|investig", "Giallo", ["tensione"], ["#232526", "#414345"], "🔎"),
  (r"action|azione|western|avventur|adventure", "Azione", ["tensione"], ["#cb2d3e", "#ef473a"], "💥"),
  (r"science fiction|fantascienza|sci-fi|fantasy", "Fantascienza", ["tensione", "emozione"], ["#0f2027", "#2c5364"], "🚀"),
  (r"romance|romantic|amore|love|sentiment|telenovel", "Romantico", ["emozione", "relax"], ["#a8577e", "#f1a7a1"], "💕"),
  (r"comedy|commedi|sitcom|risate|comic", "Commedia", ["risate", "relax"], ["#f7971e", "#ffd200"], "😂"),
  (r"children|kids|bambin|animated|animazione|cartoon|junior|anime", "Animazione", ["risate", "relax"], ["#56ccf2", "#2f80ed"], "🧸"),
  (r"documentary|documentar|natura|nature|history|storia|viaggi|travel", "Documentario", ["relax"], ["#56ab2f", "#a8e063"], "🌍"),
  (r"reality|cucina|food|chef|casa|home", "Reality", ["relax", "risate"], ["#ff512f", "#dd2476"], "🏠"),
  (r"drama|dramm", "Drammatico", ["emozione"], ["#41295a", "#2f0743"], "🎭"),
]
SKIP = r"fireplace|camino|news|notizie|tg|meteo|music|musica|shop|fail|sport|blues|religio"

def ts(s):
    return datetime.strptime(s, "%Y%m%d%H%M%S %z")

def parse(path, src, label):
    root = ET.parse(path).getroot()
    names = {c.get("id"): (c.findtext("display-name") or "") for c in root.findall("channel")}
    out = []
    for p in root.findall("programme"):
        st, en = ts(p.get("start")).astimezone(ROME), ts(p.get("stop")).astimezone(ROME)
        if not (d0 <= st <= d1): continue
        dur = int((en - st).total_seconds() // 60)
        if dur < 40: continue
        ch = names.get(p.get("channel"), "")
        cats = " ".join(c.text or "" for c in p.findall("category"))
        blob = (cats + " " + ch).lower()
        if re.search(SKIP, blob): continue
        if src == "pluto":
            ty = "film" if ("Movie" in cats and dur >= 70) else "serie"
        else:
            ty = "film" if dur >= 75 else "serie"
        g, m, c, e = "Varie", ["relax"], ["#614385", "#516395"], "📺"
        for rx, gg, mm, cc, ee in GEN:
            if re.search(rx, blob): g, m, c, e = gg, mm, cc, ee; break
        kids = 1 if g == "Animazione" else 0
        w = ["famiglia"] if kids else (["solo", "coppia"] if g in ("Horror", "Giallo") else ["solo", "coppia", "amici"])
        title = (p.findtext("title") or "").strip()
        sub = (p.findtext("sub-title") or "").strip()
        it = {"t": title, "ty": ty, "s": src, "time": st.strftime("%H:%M"), "dur": dur, "m": m, "w": w,
              "g": g, "e": e, "c": c,
              "d": f"{'Film' if ty=='film' else 'Serie'} sul canale gratuito «{ch}» di {label}" + (f", episodio «{sub}»." if sub and ty=='serie' else ".")}
        if kids: it["kids"] = 1
        score = (3 if ty == "film" else 0) + (2 if st.hour == 21 else 0) + (1 if g != "Varie" else 0)
        out.append((score, it))
    # un titolo per canale-ora, niente doppioni, i migliori 14
    seen, res = set(), []
    for sc, it in sorted(out, key=lambda x: -x[0]):
        if it["t"].lower() in seen: continue
        seen.add(it["t"].lower()); res.append(it)
        if len(res) == 14: break
    return res

items = parse(sys.argv[2], "pluto", "Pluto TV") + parse(sys.argv[3], "samsung", "Samsung TV Plus")
print(json.dumps(items, ensure_ascii=False))
