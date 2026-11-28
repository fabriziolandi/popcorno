#!/usr/bin/env python3
"""Pagine statiche per Google: programmi TV di stasera e cinema per citta'.

Uso: python3 scripts/pagine.py [cartella_sito]   (nel workflow: public)
Legge data/tv.json, data/meta.json, data/cinema/*.json della cartella del sito e i nomi
dei canali da src/lib/sources.ts; scrive stasera-in-tv/, film-stasera-in-tv/, sport-stasera-in-tv/,
serie-tv-stasera/, cinema/ e cinema/<citta>/ (una pagina per ogni citta' di scripts/citta.json,
anche senza orari, con trame e locandine da data/oggi.json o da TMDB se c'e' TMDB_KEY),
film-al-cinema/ e film-al-cinema/<film>/ (dove vedere ogni film in sala), streaming/ e per ogni piattaforma di STREAMING cosa-vedere-su-<p>/,
film-da-vedere-su-<p>/, serie-tv-da-vedere-su-<p>/ (da data/catalogo/*.json e data/trame/*.json)
e rigenera sitemap.xml.
Le pagine si rifanno a ogni esecuzione del workflow: stesso indirizzo, contenuto del giorno.
"""
import html, json, os, re, sys, datetime, unicodedata

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
BASE = "https://popcorno.it"
P = lambda *a: os.path.join(ROOT, *a)
esc = lambda s: html.escape(str(s or ""), quote=True)


def carica(path, default):
    try:
        with open(P(path), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


meta = carica("data/meta.json", {})
oggi = meta.get("data") or datetime.date.today().isoformat()
etichetta = meta.get("etichetta") or oggi            # es. "domenica 8 novembre"
agg = meta.get("aggiornato") or ""
tv = carica("data/tv.json", [])

# Nomi e numeri dei canali, dalla stessa tabella usata dall'app
SRC = {}
idx = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "lib", "sources.ts"), encoding="utf-8").read()
blocco = idx[idx.index("const SRC"):idx.index("};", idx.index("const SRC"))]
for k, body in re.findall(r'(\w+):\{([^}]*)\}', blocco):
    n = re.search(r'n:"([^"]+)"', body)
    l = re.search(r'lcn:(\d+)', body)
    if n:
        SRC[k] = {"n": n.group(1), "lcn": int(l.group(1)) if l else 999, "now": 'via:"now"' in body}

TIPI = {"film": "Film", "serie": "Serie TV", "show": "Programma", "sport": "Sport"}

# Generi TMDB -> nome italiano, dalla stessa tabella dell'app (GT in src/lib/genres.ts)
_gen = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "lib", "genres.ts"), encoding="utf-8").read()
_gt = _gen[_gen.index("export const GT"):]
_gt = _gt[:_gt.index("};")]
GENERI = {int(i): n for i, n in re.findall(r'(\d+):\["([^"]+)"', _gt)}

# Piattaforme streaming con una pagina "Cosa vedere su ...": chiave del catalogo
# (scripts/catalogo.py, public/data/catalogo/<chiave>.json) -> parte dell'indirizzo.
# Gli indirizzi non vanno cambiati: Google li ha gia' in elenco.
STREAMING = [("netflix", "netflix"), ("prime", "prime-video"), ("disney", "disney-plus"), ("now", "now"),
             ("hbo", "hbo-max"), ("apple", "apple-tv"), ("paramount", "paramount-plus"), ("raiplay", "raiplay"),
             ("infinity", "mediaset-infinity"), ("timvision", "timvision"), ("crunchyroll", "crunchyroll"), ("discovery", "discovery-plus"),
             ("mubi", "mubi"), ("pluto", "pluto-tv"), ("rakuten", "rakuten-tv")]
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre",
        "ottobre", "novembre", "dicembre"]

CSS = """@font-face{font-family:"Bricolage Grotesque";font-weight:200 800;font-display:swap;src:url(/fonts/bricolage.woff2) format("woff2")}
@font-face{font-family:Figtree;font-weight:400;font-display:swap;src:url(/fonts/figtree-400.woff2) format("woff2")}
@font-face{font-family:Figtree;font-weight:700;font-display:swap;src:url(/fonts/figtree-700.woff2) format("woff2")}
@font-face{font-family:VT323;font-weight:400;font-display:swap;src:url(/fonts/vt323.woff2) format("woff2")}
:root{--notte:#151a44;--notte2:#1d2358;--bordo:#2f377a;--luce:#ffb547;--onda:#ff4d6d;--osd:#7dfcb0;--testo:#f3f1ff;--muto:#a3a8da}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--notte);color:var(--testo);font:16px/1.5 Figtree,system-ui,sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:22px 18px 70px}
a{color:var(--luce)}
.top{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--testo);font:800 22px "Bricolage Grotesque",sans-serif;margin-bottom:20px}
.top img{width:32px;height:32px;border-radius:9px}
nav.tabs{display:flex;gap:8px;overflow-x:auto;margin:0 -18px 20px;padding:0 18px 4px}
nav.tabs a{flex:none;border:1.5px solid var(--bordo);border-radius:999px;padding:8px 14px;text-decoration:none;color:var(--testo);font-weight:700;font-size:14px}
nav.tabs a.on{background:var(--luce);border-color:var(--luce);color:#2a1700}
h1{font:800 34px/1.08 "Bricolage Grotesque",sans-serif;letter-spacing:-1px;margin-bottom:8px}
h2{font:700 21px/1.2 "Bricolage Grotesque",sans-serif;margin:28px 0 6px;color:var(--luce)}
.lead{color:var(--muto);margin-bottom:18px}
.cta{display:flex;align-items:center;justify-content:center;gap:8px;background:var(--luce);color:#2a1700;font:800 18px "Bricolage Grotesque",sans-serif;padding:15px;border-radius:18px;text-decoration:none;margin:6px 0 22px}
.it{display:grid;grid-template-columns:60px 1fr;gap:12px;padding:14px 0;border-bottom:1px solid #2f377a88}
.it img{width:60px;height:90px;object-fit:cover;border-radius:8px;background:var(--notte2)}
.it .ph{width:60px;height:90px;border-radius:8px;background:var(--notte2);display:flex;align-items:center;justify-content:center;font-size:28px}
.it h3{font:700 17px/1.25 Figtree,sans-serif}
.it .rg{font-size:13px;color:var(--muto);margin:2px 0 4px}
.it .rg b{font:20px/1 VT323,monospace;color:var(--osd);font-weight:400;margin-right:4px}
.it p{font-size:14px;color:#dcdaf3}
.ore{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.ore span{font:19px VT323,monospace;color:var(--osd);padding:1px 7px;border-radius:7px;background:#0e1233}
.sala{margin-top:6px;font-size:14px}
.citta{columns:2;gap:16px}
.citta a{display:block;padding:6px 0;text-decoration:none;color:var(--testo)}
.citta a span{color:var(--muto);font-size:13px}
.it h3 a{color:var(--testo);text-decoration:none}
.it h3 a:hover{text-decoration:underline}
.nuovo{font:700 11px Figtree,sans-serif;color:#2a1700;background:var(--onda,#ff4d6d);border-radius:999px;padding:2px 8px;vertical-align:3px;margin-left:6px}
.muto{color:var(--muto);font-size:13px}
footer{margin-top:40px;font-size:13px;color:var(--muto)}
footer a{color:var(--muto)}
footer p{margin-bottom:8px}"""

TV_PAGINE = [
    ("stasera-in-tv", "Tutto", None,
     "Stasera in TV", "Programmi TV di stasera"),
    ("film-stasera-in-tv", "Film", "film",
     "Film stasera in TV", "I film in TV stasera"),
    ("serie-tv-stasera", "Serie TV", "serie",
     "Serie TV stasera", "Le serie TV di stasera"),
    ("sport-stasera-in-tv", "Sport", "sport",
     "Sport stasera in TV", "Lo sport in TV stasera"),
]


def tabs(attiva):
    out = ['<nav class="tabs">']
    for slug, lab, *_ in TV_PAGINE:
        out.append(f'<a href="/{slug}/"{" class=on" if slug == attiva else ""}>{lab}</a>')
    out.append(f'<a href="/cinema/"{" class=on" if attiva == "cinema" else ""}>🎟️ Cinema</a>')
    out.append(f'<a href="/streaming/"{" class=on" if attiva == "streaming" else ""}>▶️ Streaming</a></nav>')
    return "".join(out)


def pagina(path, title, desc, h1, corpo, attiva, ld):
    url = f"{BASE}/{path}/"
    ld_s = json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")
    doc = f"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#151a44">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<link rel="icon" type="image/png" href="/icons/icon-180.png">
<link rel="apple-touch-icon" href="/icons/icon-180.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Popcorno">
<meta property="og:locale" content="it_IT">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{BASE}/icons/icon-512.png">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">{ld_s}</script>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<a class="top" href="/"><img src="/icons/icon-180.png" alt="">Popcorno</a>
{tabs(attiva)}
<h1>{esc(h1)}</h1>
{corpo}
<footer>
<p><a href="/">Popcorno</a> ti aiuta a scegliere cosa guardare stasera: TV, streaming e cinema.</p>
<p><a href="/stasera-in-tv/">Stasera in TV</a> · <a href="/film-stasera-in-tv/">Film stasera</a> · <a href="/serie-tv-stasera/">Serie TV stasera</a> · <a href="/sport-stasera-in-tv/">Sport stasera</a> · <a href="/cinema/">Cinema</a> · <a href="/streaming/">Streaming</a> · <a href="/privacy/">Privacy</a></p>
<p>Cosa vedere su: {" · ".join(f'<a href="/cosa-vedere-su-{s}/">{esc(nome_streaming(k))}</a>' for k, s in STREAMING)}</p>
<p>Guida TV da superguidatv.it, orari dei cinema da movieplayer.it. Locandine, trame e cataloghi da TMDB e JustWatch: questo prodotto usa le API di TMDB ma non è approvato né certificato da TMDB.</p>
</footer>
</div>
</body>
</html>
"""
    os.makedirs(P(path), exist_ok=True)
    with open(P(path, "index.html"), "w", encoding="utf-8") as f:
        f.write(doc)
    return url


def briciole(*voci):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": f"{BASE}{u}"} for i, (n, u) in enumerate(voci)]}


def canale(x):
    s = SRC.get(x.get("s"), {"n": x.get("s", ""), "lcn": 999})
    num = "" if s["lcn"] >= 999 else str(s["lcn"])
    return s["n"], num, s["lcn"]


def scheda_tv(x):
    nome, num, _ = canale(x)
    tipo = TIPI.get(x.get("ty"), "")
    extra = [tipo]
    if x.get("g") and x.get("g") != tipo:
        extra.append(x["g"])
    if x.get("y"):
        extra.append(str(x["y"])[:4])
    if x.get("v") and x.get("vc", 0) >= 20:
        extra.append(f"★ {x['v']:.1f}")
    img = (f'<img src="https://image.tmdb.org/t/p/w92{esc(x["p"])}" alt="" loading="lazy" width="60" height="90">'
           if x.get("p") else f'<div class="ph">{esc(x.get("e", "📺"))}</div>')
    canale_txt = f"{esc(nome)}" + (f" ({num})" if num else "")
    return (f'<div class="it">{img}<div><h3>{esc(x["t"])}</h3>'
            f'<div class="rg"><b>{esc(x.get("time", ""))}</b> {canale_txt} · {esc(" · ".join(extra))}</div>'
            f'<p>{esc(x.get("d", ""))}</p></div></div>')


def pagine_tv():
    urls = []
    ordinati = sorted(tv, key=lambda x: (x.get("time", "99"), canale(x)[2]))
    for slug, lab, tipo, h1, sottotitolo in TV_PAGINE:
        voci = [x for x in ordinati if tipo is None or x.get("ty") == tipo]
        nomi = [x["t"] for x in voci[:4]]
        h1_full = f"{h1} – {etichetta}"
        title = f"{h1} {etichetta}: {len(voci)} programmi | Popcorno" if tipo is None else f"{h1} {etichetta} | Popcorno"
        desc = (f"{sottotitolo} ({etichetta}) su Rai, Mediaset, La7, Sky e altri canali: "
                f"{', '.join(nomi)} e altri, con orari e trame.")[:300]
        if voci:
            lista = "".join(scheda_tv(x) for x in voci)
        else:
            lista = "<p class=lead>Per stasera non ci sono programmi di questo tipo nella guida.</p>"
        corpo = (f'<p class="lead">{esc(sottotitolo)}, {esc(etichetta)}: orari, canali e trame. '
                 f'Aggiornato {esc(agg)}.</p>'
                 f'<a class="cta" href="/">🍿 Non sai cosa scegliere? Scegli per me</a>{lista}')
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebPage", "name": h1_full, "url": f"{BASE}/{slug}/", "inLanguage": "it",
             "dateModified": oggi, "isPartOf": {"@type": "WebSite", "name": "Popcorno", "url": BASE + "/"}},
            {"@type": "ItemList", "name": h1_full, "numberOfItems": len(voci), "itemListElement": [
                {"@type": "ListItem", "position": i + 1,
                 "name": f'{x["t"]} – {canale(x)[0]} {x.get("time", "")}'} for i, x in enumerate(voci[:50])]},
            briciole(("Popcorno", "/"), (h1, f"/{slug}/"))]}
        urls.append(pagina(slug, title, desc, h1_full, corpo, slug, ld))
    return urls


REGIONI = {
    "Abruzzo": ["l-aquila", "pescara", "teramo"],
    "Basilicata": ["matera", "potenza"],
    "Calabria": ["catanzaro", "cosenza", "reggio-calabria", "vibo-valentia"],
    "Campania": ["benevento", "napoli", "salerno"],
    "Emilia-Romagna": ["bologna", "ferrara", "forli", "modena", "parma", "piacenza", "ravenna", "reggio-emilia", "rimini"],
    "Friuli-Venezia Giulia": ["pordenone", "trieste", "udine"],
    "Lazio": ["frosinone", "latina", "rieti", "roma"],
    "Liguria": ["genova", "imperia", "la-spezia", "savona"],
    "Lombardia": ["bergamo", "brescia", "como", "cremona", "lecco", "lodi", "mantova", "milano", "monza-e-brianza",
                  "pavia", "varese"],
    "Marche": ["ancona", "ascoli-piceno", "fermo", "macerata", "pesaro"],
    "Molise": ["campobasso"],
    "Piemonte": ["alessandria", "asti", "biella", "cuneo", "novara", "torino", "verbania", "vercelli"],
    "Puglia": ["bari", "barletta-andria-trani", "brindisi", "foggia", "lecce"],
    "Sardegna": ["cagliari", "nuoro", "olbia", "oristano", "sassari"],
    "Sicilia": ["agrigento", "caltanissetta", "catania", "messina", "palermo", "ragusa", "siracusa", "trapani"],
    "Toscana": ["arezzo", "firenze", "grosseto", "livorno", "lucca", "massa", "pisa", "pistoia", "prato", "siena"],
    "Trentino-Alto Adige": ["bolzano", "trento"],
    "Umbria": ["perugia", "terni"],
    "Valle d'Aosta": ["aosta"],
    "Veneto": ["belluno", "padova", "rovigo", "treviso", "venezia", "verona", "vicenza"],
}
REGIONE = {s: r for r, ss in REGIONI.items() for s in ss}


def nrm(t):
    """Titolo confrontabile: minuscolo, senza accenti e punteggiatura."""
    t = unicodedata.normalize("NFD", str(t or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def slugify(t):
    return nrm(t).replace(" ", "-")[:80].strip("-") or "film"


def data_it(iso):
    try:
        d = datetime.date.fromisoformat(iso[:10])
        return f"{d.day} {MESI[d.month - 1]} {d.year}"
    except Exception:
        return ""


def info_film_tmdb(titoli):
    """Titolo normalizzato -> scheda (trama, locandina, genere, durata, voto...).
    Prima i film in sala di TMDB gia' letti per l'app (data/oggi.json, campo "cinema"); per gli altri,
    se c'e' TMDB_KEY, una ricerca per titolo esatto (salvata in data/cinema/_tmdb.json per i giorni dopo)."""
    info = {}
    for x in (carica("data/oggi.json", {}) or {}).get("cinema") or []:
        k = nrm(x.get("t"))
        if k and k not in info:
            info[k] = {"t": x.get("t"), "d": x.get("d") or "", "p": x.get("p") or "", "g": x.get("g") or "",
                       "dur": x.get("dur") or 0, "v": x.get("v") or 0, "vc": x.get("vc") or 0,
                       "y": x.get("y") or "", "uscita": x.get("uscita") or "", "nuovo": bool(x.get("nuovo")),
                       "kids": bool(x.get("kids")), "tmdb": x.get("tmdb") or ""}
    cache = carica("data/cinema/_tmdb.json", {}) or {}
    key = os.environ.get("TMDB_KEY", "")
    mancano = [t for t in titoli if nrm(t) not in info]
    nuovi = 0
    for t in mancano:
        k = nrm(t)
        if k in cache:
            if cache[k]:
                info[k] = cache[k]
            continue
        if not key or nuovi >= 120:
            continue
        nuovi += 1
        cache[k] = cerca_tmdb(t, key)
        if cache[k]:
            info[k] = cache[k]
    if nuovi:
        try:
            os.makedirs(P("data/cinema"), exist_ok=True)
            with open(P("data/cinema/_tmdb.json"), "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False)
        except Exception:
            pass
    return info


def cerca_tmdb(titolo, key):
    import urllib.parse, urllib.request

    def get(path, **q):
        q.update(api_key=key, language="it-IT")
        url = f"https://api.themoviedb.org/3{path}?{urllib.parse.urlencode(q)}"
        with urllib.request.urlopen(url, timeout=15) as r:
            return json.load(r)

    try:
        k = nrm(titolo)
        res = get("/search/movie", query=titolo, region="IT").get("results", [])
        # solo titolo identico (italiano o originale): meglio nessuna scheda che quella di un altro film
        ok = [r for r in res if k in (nrm(r.get("title")), nrm(r.get("original_title")))]
        if not ok:
            return None
        r = max(ok, key=lambda r: (r.get("vote_count", 0), r.get("popularity", 0)))
        d = get(f"/movie/{r['id']}")
        gid = [g["id"] for g in d.get("genres", [])]
        trama = (d.get("overview") or "").strip()
        if len(trama) > 260:
            trama = trama[:257].rsplit(" ", 1)[0] + "…"
        rel = d.get("release_date") or ""
        return {"t": d.get("title") or titolo, "d": trama, "p": d.get("poster_path") or "",
                "g": GENERI.get(gid[0], "") if gid else "", "dur": d.get("runtime") or 0,
                "v": round(d.get("vote_average") or 0, 1), "vc": d.get("vote_count") or 0, "y": rel[:4],
                "uscita": rel, "nuovo": False, "kids": bool(set(gid) & {16, 10751}) and 27 not in gid,
                "tmdb": f"movie/{r['id']}"}
    except Exception:
        return None


def citta_conosciute():
    """slug -> nome: le citta' di scripts/citta.json piu' quelle con orari oggi.
    Le citta' conosciute hanno sempre la loro pagina, cosi' un indirizzo gia' indicizzato non diventa 404
    nei giorni in cui la fonte non ha orari. Una citta' nuova va aggiunta a scripts/citta.json."""
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "citta.json"), encoding="utf-8") as f:
            note = json.load(f)
    except Exception:
        note = {}
    indice = carica("data/cinema/index.json", {}).get("citta", {})
    tutte = dict(note)
    for slug, info in indice.items():
        tutte[slug] = info.get("n") or tutte.get(slug) or slug
    nuove = sorted(set(indice) - set(note))
    if nuove:
        print("citta' con orari non presenti in scripts/citta.json:", ", ".join(nuove), file=sys.stderr)
    return tutte


def meta_film(i):
    """Riga breve sotto il titolo: genere · anno · durata · voto."""
    if not i:
        return ""
    v = [i.get("g") or "", str(i.get("y") or "")]
    if i.get("dur"):
        v.append(f"{i['dur'] // 60} h {i['dur'] % 60:02d} min" if i["dur"] >= 60 else f"{i['dur']} min")
    out = esc(" · ".join(x for x in v if x))
    if i.get("v") and i.get("vc", 0) >= 50:
        out = f"<b>★ {i['v']:.1f}</b> " + out
    return out


def locandina(i, t, w=92, wpx=60, hpx=90):
    if i and i.get("p"):
        return (f'<img src="https://image.tmdb.org/t/p/w{w}{esc(i["p"])}" alt="Locandina di {esc(t)}" '
                f'loading="lazy" width="{wpx}" height="{hpx}">')
    return '<div class="ph">🎬</div>'


def ld_film(t, i, url):
    m = {"@type": "Movie", "name": t, "url": url}
    if i:
        if i.get("p"):
            m["image"] = f"https://image.tmdb.org/t/p/w342{i['p']}"
        if i.get("d"):
            m["description"] = i["d"]
        if i.get("g"):
            m["genre"] = i["g"]
        if i.get("uscita"):
            m["datePublished"] = i["uscita"][:10]
        if i.get("dur"):
            m["duration"] = f"PT{i['dur'] // 60}H{i['dur'] % 60}M"
    return m


def leggi_cinema():
    """Tutte le citta' con i loro film: slug -> (nome, dati, {titolo: [(sala, orari)]})."""
    out = {}
    for slug, nome_noto in citta_conosciute().items():
        d = carica(f"data/cinema/{slug}.json", None) or {}
        film = {}
        for s in d.get("sale") or []:
            for f in s.get("f", []):
                if f.get("t"):
                    film.setdefault(f["t"], []).append((s, f.get("o", [])))
        out[slug] = (d.get("citta") or nome_noto, d, film)
    return out


def introduzione(nome, d, film, info, ord_film):
    """Qualche frase scritta dai dati della citta': cambia da citta' a citta' e da giorno a giorno."""
    n_sale = len(d.get("sale") or [])
    frasi = [f"Oggi, {etichetta}, nei {n_sale} cinema di {nome} sono in programmazione {len(film)} film."
             if n_sale > 1 else f"Oggi, {etichetta}, l'unico cinema di {nome} che conosciamo ha in programma {len(film)} film."]
    t0, sale0 = ord_film[0]
    if n_sale > 1 and len(sale0) > 1:
        frasi.append(f"{t0} è in tutte le sale." if len(sale0) == n_sale else
                     f"Il film in più sale è {t0}, in {len(sale0)} cinema su {n_sale}.")
    nuovi = [t for t, _ in ord_film if (info.get(nrm(t)) or {}).get("nuovo")][:3]
    if nuovi:
        frasi.append(("Novità della settimana: " if len(nuovi) > 1 else "Appena uscito: ") + ", ".join(nuovi) + ".")
    bimbi = [t for t, _ in ord_film if (info.get(nrm(t)) or {}).get("kids")][:2]
    if bimbi:
        frasi.append("Per andare al cinema con i bambini: " + " e ".join(bimbi) + ".")
    orari = sorted(o for _, sale in film.items() for _, oo in sale for o in oo if re.match(r"^\d{1,2}[:.]\d{2}$", o))
    if orari:
        frasi.append(f"Il primo spettacolo è alle {orari[0].replace('.', ':')}, l'ultimo alle {orari[-1].replace('.', ':')}.")
    generi = {}
    for t, sale in film.items():
        g = (info.get(nrm(t)) or {}).get("g")
        if g:
            generi[g] = generi.get(g, 0) + 1
    top = sorted(generi.items(), key=lambda kv: -kv[1])[:2]
    if top and len(film) >= 4:
        frasi.append("I generi più presenti sono " + " e ".join(g.lower() for g, _ in top) + ".")
    return " ".join(frasi)


def vicine(slug, tutte, conta):
    """Link alle altre citta' della stessa regione."""
    reg = REGIONE.get(slug)
    altre = [s for s in REGIONI.get(reg, []) if s != slug and s in tutte]
    if not altre:
        return ""
    voci = "".join(f'<a href="/cinema/{s}/">Cinema a {esc(tutte[s][0])}'
                   + (f' <span>· {conta[s]} film</span>' if conta.get(s) else "") + "</a>" for s in altre)
    return f'<h2>Altre città in {esc(reg)}</h2><div class="citta">{voci}</div>'


def pagina_cinema_vuota(slug, nome, tutte, conta):
    h1 = f"Cinema a {nome}: programmazione di oggi"
    title = f"Programmazione cinema {nome} oggi – orari e film | Popcorno"
    desc = (f"Film in sala e orari dei cinema a {nome}. Oggi ({etichetta}) gli orari non sono disponibili: "
            f"guarda le città vicine o scegli cosa guardare stasera in TV e in streaming.")[:300]
    corpo = (f'<p class="lead">Oggi non abbiamo gli orari dei cinema di {esc(nome)}: la nostra fonte non li ha pubblicati. '
             f'Di solito tornano nei prossimi giorni.</p>'
             f'<a class="cta" href="/stasera-in-tv/">📺 Guarda cosa c\'è stasera in TV</a>'
             + vicine(slug, tutte, conta)
             + '<p class="lead" style="margin-top:20px"><a href="/cinema/">← Tutte le città</a></p>')
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebPage", "name": h1, "url": f"{BASE}/cinema/{slug}/", "inLanguage": "it", "dateModified": oggi},
        briciole(("Popcorno", "/"), ("Cinema", "/cinema/"), (nome, f"/cinema/{slug}/"))]}
    return pagina(f"cinema/{slug}", title, desc, h1, corpo, "cinema", ld)


def pagine_cinema():
    urls = []
    tutte = leggi_cinema()
    titoli = sorted({t for _, _, film in tutte.values() for t in film})
    info = info_film_tmdb(titoli)
    conta = {s: len(film) for s, (_, _, film) in tutte.items()}

    # Film -> pagina propria (stesso indirizzo finche' e' in sala), con l'elenco delle citta'
    film_slug, usati = {}, set()
    for t in titoli:
        k = nrm(t)
        if k in film_slug:
            continue
        s = slugify(t)
        if s in usati:
            s = f"{s}-{(info.get(k) or {}).get('y') or len(usati)}"
        usati.add(s)
        film_slug[k] = s
    link_film = lambda t: f"/film-al-cinema/{film_slug[nrm(t)]}/"

    citta_ok, vuote = [], []
    for slug, (nome, d, film) in sorted(tutte.items(), key=lambda kv: kv[1][0]):
        if not film:
            vuote.append((slug, nome))
            urls.append(pagina_cinema_vuota(slug, nome, tutte, conta))
            continue
        citta_ok.append((slug, nome, len(d["sale"]), len(film)))
        ord_film = sorted(film.items(), key=lambda kv: (-len(kv[1]), -((info.get(nrm(kv[0])) or {}).get("vc") or 0), kv[0]))
        righe = []
        for t, sale in ord_film:
            i = info.get(nrm(t))
            dove = "".join(
                f'<div class="sala"><a href="{esc(s.get("url", "#"))}" rel="nofollow noopener">{esc(s["n"])}</a>'
                f'<div class="ore">{"".join(f"<span>{esc(o)}</span>" for o in orari)}</div></div>'
                for s, orari in sale)
            badge = ' <span class="nuovo">Novità</span>' if i and i.get("nuovo") else ""
            trama = f'<p>{esc(i["d"])}</p>' if i and i.get("d") else ""
            righe.append(f'<div class="it">{locandina(i, t)}<div><h3><a href="{link_film(t)}">{esc(t)}</a>{badge}</h3>'
                         f'<div class="rg">{meta_film(i)}</div>{trama}{dove}</div></div>')
        elenco_sale = "".join(f'<li><a href="{esc(s.get("url", "#"))}" rel="nofollow noopener">{esc(s["n"])}</a>'
                              f' – {esc(s.get("ind", ""))} <span class="muto">· {len(s.get("f", []))} film</span></li>'
                              for s in d["sale"])
        h1 = f"Programmazione cinema {nome} oggi"
        title = f"Programmazione cinema {nome} oggi – orari e film | Popcorno"
        primi = ", ".join(t for t, _ in ord_film[:3])
        desc = (f"Cinema a {nome} oggi, {etichetta}: {primi} e gli altri {len(film)} film in "
                f"{len(d['sale'])} {'sale' if len(d['sale']) > 1 else 'sala'}, con orari, trame e locandine.")[:300]
        nota = ""
        if d.get("agg") and d["agg"] != oggi:
            nota = f' Orari aggiornati al {d["agg"][8:10]}/{d["agg"][5:7]}: verifica con il cinema.'
        corpo = (f'<p class="lead">{esc(introduzione(nome, d, film, info, ord_film))}{esc(nota)}</p>'
                 f'<a class="cta" href="/">🍿 Scegli il film giusto per te</a>'
                 + f'<h2>Film in sala oggi a {esc(nome)}</h2>' + "".join(righe)
                 + f'<h2>Le sale di {esc(nome)}</h2><ul style="padding-left:20px">{elenco_sale}</ul>'
                 + vicine(slug, tutte, conta)
                 + '<p class="lead" style="margin-top:20px"><a href="/cinema/">← Tutte le città</a> · '
                   '<a href="/film-al-cinema/">Tutti i film in sala</a></p>')
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebPage", "name": h1, "url": f"{BASE}/cinema/{slug}/", "inLanguage": "it", "dateModified": oggi},
            {"@type": "ItemList", "name": f"Film al cinema a {nome}", "numberOfItems": len(film),
             "itemListElement": [{"@type": "ListItem", "position": n + 1,
                                  "item": ld_film(t, info.get(nrm(t)), BASE + link_film(t))}
                                 for n, (t, _) in enumerate(ord_film[:50])]},
            *[{"@type": "MovieTheater", "name": s["n"], "address": s.get("ind", "")} for s in d["sale"][:30]],
            briciole(("Popcorno", "/"), ("Cinema", "/cinema/"), (nome, f"/cinema/{slug}/"))]}
        urls.append(pagina(f"cinema/{slug}", title, desc, h1, corpo, "cinema", ld))

    # Pagine dei film
    per_film = {}
    for slug, (nome, d, film) in tutte.items():
        for t, sale in film.items():
            per_film.setdefault(nrm(t), {"t": t, "citta": []})["citta"].append((slug, nome, sale))
    elenco_film = []
    for k, v in per_film.items():
        t, i = v["t"], info.get(k)
        cc = sorted(v["citta"], key=lambda c: c[1])
        n_sale = sum(len(sale) for _, _, sale in cc)
        elenco_film.append((t, k, len(cc), n_sale, i))
        path = f"film-al-cinema/{film_slug[k]}"
        blocchi = []
        for reg in sorted({REGIONE.get(s, "Altre città") for s, _, _ in cc}):
            dentro = [c for c in cc if REGIONE.get(c[0], "Altre città") == reg]
            html_c = ""
            for s, nome, sale in dentro:
                html_c += (f'<div class="sala"><b><a href="/cinema/{s}/">{esc(nome)}</a></b>'
                           + "".join(f'<div style="margin-top:4px">{esc(sa["n"])}<div class="ore">'
                                     f'{"".join(f"<span>{esc(o)}</span>" for o in orari)}</div></div>'
                                     for sa, orari in sale) + '</div>')
            blocchi.append(f'<h2>{esc(reg)}</h2>{html_c}')
        info_txt = ""
        if i:
            pezzi = []
            if i.get("uscita"):
                pezzi.append(f"Uscita: {data_it(i['uscita'])}")
            info_txt = f'<div class="rg">{meta_film(i)}</div>' + (f'<p>{esc(i["d"])}</p>' if i.get("d") else "") \
                + (f'<p class="muto">{esc(" · ".join(pezzi))}</p>' if pezzi else "")
        testa = (f'<div class="it" style="grid-template-columns:120px 1fr">'
                 + (locandina(i, t, 185, 120, 180).replace('<img ', '<img style="width:120px;height:180px" ')
                    .replace('class="ph"', 'class="ph" style="width:120px;height:180px"'))
                 + f'<div>{info_txt}</div></div>')
        h1 = f"{t}: dove vederlo al cinema oggi"
        title = f"{t} al cinema oggi: orari in {len(cc)} {'città' if len(cc) > 1 else 'città'} | Popcorno"
        nomi = ", ".join(c[1] for c in sorted(cc, key=lambda c: -len(c[2]))[:5])
        desc = (f"Dove vedere {t} al cinema oggi, {etichetta}: orari in {n_sale} "
                f"{'sale' if n_sale > 1 else 'sala'} a {nomi}" + (" e altre città." if len(cc) > 5 else ".")
                + (f" {i['d']}" if i and i.get("d") else ""))[:300]
        corpo = (f'<p class="lead">Oggi, {esc(etichetta)}, {esc(t)} è in programmazione in {n_sale} '
                 f'{"sale" if n_sale > 1 else "sala"} di {len(cc)} {"città" if len(cc) > 1 else "città"}.</p>'
                 + testa + "".join(blocchi)
                 + '<p class="lead" style="margin-top:20px"><a href="/film-al-cinema/">← Tutti i film in sala</a> · '
                   '<a href="/cinema/">Tutte le città</a></p>')
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebPage", "name": h1, "url": f"{BASE}/{path}/", "inLanguage": "it", "dateModified": oggi},
            ld_film(t, i, f"{BASE}/{path}/"),
            briciole(("Popcorno", "/"), ("Film al cinema", "/film-al-cinema/"), (t, f"/{path}/"))]}
        urls.append(pagina(path, title, desc, h1, corpo, "cinema", ld))

    # Indice dei film in sala
    elenco_film.sort(key=lambda f: (-f[2], -f[3], f[0]))
    schede = "".join(
        f'<div class="it">{locandina(i, t)}<div><h3><a href="/film-al-cinema/{film_slug[k]}/">{esc(t)}</a></h3>'
        f'<div class="rg">{meta_film(i)}</div><p class="muto">In {nc} {"città" if nc > 1 else "città"}, {ns} '
        f'{"sale" if ns > 1 else "sala"}</p></div></div>' for t, k, nc, ns, i in elenco_film)
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "name": "Film al cinema oggi", "url": f"{BASE}/film-al-cinema/", "inLanguage": "it"},
        {"@type": "ItemList", "name": "Film al cinema oggi in Italia", "numberOfItems": len(elenco_film),
         "itemListElement": [{"@type": "ListItem", "position": n + 1,
                              "item": ld_film(t, i, f"{BASE}/film-al-cinema/{film_slug[k]}/")}
                             for n, (t, k, _, _, i) in enumerate(elenco_film[:60])]},
        briciole(("Popcorno", "/"), ("Film al cinema", "/film-al-cinema/"))]}
    primi = ", ".join(f[0] for f in elenco_film[:4])
    urls.insert(0, pagina("film-al-cinema", f"Film al cinema oggi: {len(elenco_film)} film in sala e dove vederli | Popcorno",
                          (f"I film al cinema oggi in Italia ({etichetta}): {primi} e gli altri, con trame, "
                           f"locandine e orari città per città.")[:300],
                          "Film al cinema oggi",
                          f'<p class="lead">I {len(elenco_film)} film in programmazione oggi, {esc(etichetta)}, nei cinema '
                          f'delle {len(citta_ok)} città che seguiamo, dal più programmato. Tocca un film per vedere dove e a che ora.</p>'
                          f'<a class="cta" href="/cinema/">🎟️ Cerca per città</a>{schede}', "cinema", ld))

    # Indice delle citta', per regione
    blocchi = []
    for reg in sorted(REGIONI) + ["Altre città"]:
        ss = sorted([s for s in tutte if REGIONE.get(s, "Altre città") == reg], key=lambda s: tutte[s][0])
        if not ss:
            continue
        voci = "".join(f'<a href="/cinema/{s}/">{esc(tutte[s][0])} <span>· '
                       + (f'{conta[s]} film' if conta[s] else 'orari non disponibili oggi') + '</span></a>' for s in ss)
        blocchi.append(f'<h2>{esc(reg)}</h2><div class="citta">{voci}</div>')
    top = "".join(f'<a href="/film-al-cinema/{film_slug[k]}/">{esc(t)} <span>· {nc} città</span></a>'
                  for t, k, nc, _, _ in elenco_film[:10])
    corpo = (f'<p class="lead">Film in sala e orari di oggi, {esc(etichetta)}, in {len(citta_ok)} città italiane. '
             f'Scegli la tua città o il film che vuoi vedere.</p><a class="cta" href="/">🍿 Scegli cosa vedere stasera</a>'
             + (f'<h2>I film più programmati oggi</h2><div class="citta">{top}</div>'
                f'<p class="lead" style="margin-top:10px"><a href="/film-al-cinema/">Tutti i film in sala →</a></p>' if top else "")
             + "".join(blocchi))
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "name": "Programmazione dei cinema di oggi", "url": f"{BASE}/cinema/", "inLanguage": "it"},
        briciole(("Popcorno", "/"), ("Cinema", "/cinema/"))]}
    grandi = ", ".join(n for _, n, _, _ in sorted(citta_ok, key=lambda c: -c[2])[:5])
    urls.insert(0, pagina("cinema", f"Programmazione cinema oggi – orari e film in {len(citta_ok)} città | Popcorno",
                          f"Programmazione dei cinema di oggi ({etichetta}) a {grandi} e in altre città italiane: "
                          f"film in sala, trame e orari.",
                          "Programmazione dei cinema di oggi", corpo, "cinema", ld))
    return urls


NOMI_STREAMING = {"now": "NOW"}
nome_streaming = lambda k: NOMI_STREAMING.get(k) or SRC.get(k, {}).get("n") or k
_trame = {}


def trama(r):
    b = r[0] % 100
    if b not in _trame:
        _trame[b] = carica(f"data/trame/{b}.json", {})
    return _trame[b].get(("m" if r[1] == 0 else "t") + str(r[0]), "")


def scheda_cat(r):
    """Una riga del catalogo: [id, tipo 0 film/1 serie, titolo, anno, voto, generi, popolarita', poster, voti, lingua]."""
    extra = ["Film" if r[1] == 0 else "Serie TV"]
    gen = [GENERI[g] for g in (r[5] or []) if g in GENERI][:2]
    extra += gen
    if r[3]:
        extra.append(str(r[3]))
    voto = f"<b>★ {r[4]:.1f}</b> " if r[4] and r[8] >= 20 else ""
    img = (f'<img src="https://image.tmdb.org/t/p/w92{esc(r[7])}" alt="{esc(r[2])}" loading="lazy" width="60" height="90">'
           if r[7] else f'<div class="ph">{"🎬" if r[1] == 0 else "📺"}</div>')
    d = trama(r)
    return (f'<div class="it">{img}<div><h3>{esc(r[2])}</h3>'
            f'<div class="rg">{voto}{esc(" · ".join(extra))}</div>'
            + (f'<p>{esc(d)}</p>' if d else "") + '</div></div>')


def popolari(rows, n):
    """I piu' popolari, prima quelli con un voto decente e abbastanza voti, poi gli altri.
    La popolarita' TMDB e' mondiale: senza la soglia dei voti escono titoli quasi sconosciuti in Italia.
    I programmi per bambini (genere TMDB 10762) vanno in fondo."""
    buoni = [r for r in rows if r[8] >= 300 and r[4] >= 6.3 and 10762 not in (r[5] or [])]
    resto = [r for r in rows if r not in buoni]
    return (sorted(buoni, key=lambda r: -r[6]) + sorted(resto, key=lambda r: -r[6]))[:n]


def votati(rows, n, esclusi=()):
    ids = {(r[0], r[1]) for r in esclusi}
    ok = [r for r in rows if r[8] >= 500 and (r[0], r[1]) not in ids]
    return sorted(ok, key=lambda r: (-r[4], -r[8]))[:n]


def ld_lista(nome, voci):
    return {"@type": "ItemList", "name": nome, "numberOfItems": len(voci), "itemListElement": [
        {"@type": "ListItem", "position": i + 1,
         "item": {"@type": "Movie" if r[1] == 0 else "TVSeries", "name": r[2],
                  **({"dateCreated": str(r[3])} if r[3] else {})}} for i, r in enumerate(voci)]}


def pagine_streaming():
    urls, indice = [], []
    d0 = datetime.date.fromisoformat(oggi)
    mese = f"{MESI[d0.month - 1]} {d0.year}"
    for key, slug in STREAMING:
        nome = nome_streaming(key)
        cat = carica(f"data/catalogo/{key}.json", None)
        rows = (cat or {}).get("t") or []
        film = [r for r in rows if r[1] == 0]
        serie = [r for r in rows if r[1] == 1]
        hub = f"cosa-vedere-su-{slug}"
        sotto = []   # (tipo, path, etichetta, righe)
        if len(film) >= 5 or not rows:
            sotto.append(("film", f"film-da-vedere-su-{slug}", "Film", film))
        if len(serie) >= 5 or not rows:
            sotto.append(("serie", f"serie-tv-da-vedere-su-{slug}", "Serie TV", serie))
        indice.append((slug, nome, len(film), len(serie)))
        cta = f'<a class="cta" href="/">🍿 Non sai cosa scegliere? Scegli per me</a>'
        vuoto = (f'<p class="lead">Oggi non abbiamo il catalogo di {esc(nome)}: la nostra fonte non ha risposto. '
                 f'Di solito torna al prossimo aggiornamento.</p>')

        # Pagina principale della piattaforma
        h1 = f"Cosa vedere su {nome}"
        title = f"Cosa vedere su {nome}: film e serie TV più popolari, {mese} | Popcorno"
        pf, ps = popolari(film, 12), popolari(serie, 12)
        top = votati(rows, 10, pf + ps)
        primi = ", ".join(r[2] for r in popolari(rows, 4))
        desc = (f"Cosa guardare su {nome} in Italia ({mese}): {primi} e gli altri film e serie TV più popolari, "
                f"con voti e trame. {len(film)} film e {len(serie)} serie nel catalogo." if rows else
                f"Cosa guardare su {nome} in Italia: film e serie TV più popolari, con voti e trame.")[:300]
        if rows:
            corpo = (f'<p class="lead">I film e le serie TV più popolari su {esc(nome)} in Italia, {esc(mese)}: '
                     f'{len(film)} film e {len(serie)} serie in catalogo. Aggiornato il {d0.day} {esc(MESI[d0.month - 1])}.</p>' + cta)
            for tipo, path, lab, righe in sotto:
                scelti = pf if tipo == "film" else ps
                if not scelti:
                    continue
                corpo += (f'<h2>{lab} più popolari su {esc(nome)}</h2>' + "".join(scheda_cat(r) for r in scelti)
                          + f'<p class="lead" style="margin-top:12px"><a href="/{path}/">Tutti i {lab.lower()} da vedere su {esc(nome)} →</a></p>')
            if top:
                corpo += f'<h2>I più votati su {esc(nome)}</h2>' + "".join(scheda_cat(r) for r in top)
        else:
            corpo = vuoto + cta
        corpo += '<p class="lead" style="margin-top:20px"><a href="/streaming/">← Tutte le piattaforme</a></p>'
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebPage", "name": h1, "url": f"{BASE}/{hub}/", "inLanguage": "it", "dateModified": oggi},
            ld_lista(f"Film e serie più popolari su {nome}", popolari(rows, 24)),
            briciole(("Popcorno", "/"), ("Streaming", "/streaming/"), (nome, f"/{hub}/"))]}
        urls.append(pagina(hub, title, desc, h1, corpo, "streaming", ld))

        # Solo film e solo serie
        for tipo, path, lab, righe in sotto:
            h1 = f"{lab} da vedere su {nome}"
            pop = popolari(righe, 40)
            best = votati(righe, 20, pop)
            primi = ", ".join(r[2] for r in pop[:4])
            title = f"{lab} da vedere su {nome}: i più popolari di {mese} | Popcorno"
            desc = (f"I {lab.lower()} da vedere su {nome} in Italia ({mese}): {primi} e altri "
                    f"{max(len(righe) - 4, 0)} titoli, con voti e trame." if righe else
                    f"I {lab.lower()} da vedere su {nome} in Italia, con voti e trame.")[:300]
            if righe:
                corpo = (f'<p class="lead">I {len(pop)} {lab.lower()} più popolari su {esc(nome)} in Italia, {esc(mese)}, '
                         f'su {len(righe)} in catalogo.</p>' + cta
                         + f'<h2>I più popolari</h2>' + "".join(scheda_cat(r) for r in pop))
                if best:
                    corpo += f'<h2>I più votati</h2>' + "".join(scheda_cat(r) for r in best)
            else:
                corpo = vuoto + cta
            corpo += (f'<p class="lead" style="margin-top:20px"><a href="/{hub}/">← Cosa vedere su {esc(nome)}</a></p>')
            ld = {"@context": "https://schema.org", "@graph": [
                {"@type": "WebPage", "name": h1, "url": f"{BASE}/{path}/", "inLanguage": "it", "dateModified": oggi},
                ld_lista(h1, pop),
                briciole(("Popcorno", "/"), ("Streaming", "/streaming/"), (nome, f"/{hub}/"), (lab, f"/{path}/"))]}
            urls.append(pagina(path, title, desc, h1, corpo, "streaming", ld))

    voci = "".join(f'<a href="/cosa-vedere-su-{s}/">{esc(n)} <span>· {nf} film, {ns} serie</span></a>'
                   if nf + ns else f'<a href="/cosa-vedere-su-{s}/">{esc(n)}</a>' for s, n, nf, ns in indice)
    corpo = (f'<p class="lead">Cosa guardare stasera sulle piattaforme streaming in Italia: i film e le serie TV '
             f'più popolari di {esc(mese)}, piattaforma per piattaforma.</p>'
             f'<a class="cta" href="/">🍿 Scegli tra le piattaforme che hai</a><div class="citta">{voci}</div>')
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "name": "Cosa vedere in streaming", "url": f"{BASE}/streaming/", "inLanguage": "it"},
        briciole(("Popcorno", "/"), ("Streaming", "/streaming/"))]}
    urls.insert(0, pagina("streaming", f"Cosa vedere in streaming: Netflix, Prime Video, Disney+ e altri, {mese} | Popcorno",
                          f"I film e le serie TV più popolari di {mese} su Netflix, Prime Video, Disney+, NOW, RaiPlay "
                          f"e le altre piattaforme streaming in Italia.", "Cosa vedere in streaming", corpo, "streaming", ld))
    return urls


def sitemap(urls):
    tutte = [(f"{BASE}/", "daily"), (f"{BASE}/privacy/", "yearly")] + [(u, "daily") for u in urls]
    righe = "".join(f"  <url><loc>{u}</loc><lastmod>{oggi}</lastmod><changefreq>{c}</changefreq></url>\n"
                    for u, c in tutte)
    with open(P("sitemap.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + righe + "</urlset>\n")


if __name__ == "__main__":
    u = pagine_tv() + pagine_cinema() + pagine_streaming()
    sitemap(u)
    print(f"{len(u)} pagine, {len(tv)} programmi", file=sys.stderr)
