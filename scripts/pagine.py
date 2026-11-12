#!/usr/bin/env python3
"""Pagine statiche per Google: programmi TV di stasera e cinema per citta'.

Uso: python3 scripts/pagine.py [cartella_sito]   (nel workflow: public)
Legge data/tv.json, data/meta.json, data/cinema/*.json della cartella del sito e i nomi
dei canali da src/lib/sources.ts; scrive stasera-in-tv/, film-stasera-in-tv/, sport-stasera-in-tv/,
serie-tv-stasera/, cinema/ e cinema/<citta>/ (una pagina per ogni citta' di scripts/citta.json,
anche senza orari), streaming/ e per ogni piattaforma di STREAMING cosa-vedere-su-<p>/,
film-da-vedere-su-<p>/, serie-tv-da-vedere-su-<p>/ (da data/catalogo/*.json e data/trame/*.json)
e rigenera sitemap.xml.
Le pagine si rifanno a ogni esecuzione del workflow: stesso indirizzo, contenuto del giorno.
"""
import html, json, os, re, sys, datetime

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
             ("infinity", "mediaset-infinity"), ("timvision", "timvision"), ("crunchyroll", "crunchyroll"),
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


def pagina_cinema_vuota(slug, nome):
    h1 = f"Cinema a {nome}: film e orari di oggi"
    title = f"Cinema {nome}: film in sala e orari, {etichetta} | Popcorno"
    desc = (f"Film in sala e orari dei cinema a {nome}. Oggi ({etichetta}) gli orari non sono disponibili: "
            f"torna domani o scegli cosa guardare stasera in TV e in streaming.")[:300]
    corpo = (f'<p class="lead">Oggi non abbiamo gli orari dei cinema di {esc(nome)}: la nostra fonte non li ha pubblicati. '
             f'Di solito tornano nei prossimi giorni.</p>'
             f'<a class="cta" href="/stasera-in-tv/">📺 Guarda cosa c\'è stasera in TV</a>'
             '<p class="lead" style="margin-top:20px"><a href="/cinema/">← Tutte le città</a></p>')
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebPage", "name": h1, "url": f"{BASE}/cinema/{slug}/", "inLanguage": "it", "dateModified": oggi},
        briciole(("Popcorno", "/"), ("Cinema", "/cinema/"), (nome, f"/cinema/{slug}/"))]}
    return pagina(f"cinema/{slug}", title, desc, h1, corpo, "cinema", ld)


def pagine_cinema():
    urls = []
    citta_ok = []
    vuote = []
    for slug, nome_noto in sorted(citta_conosciute().items(), key=lambda kv: kv[1]):
        d = carica(f"data/cinema/{slug}.json", None) or {}
        nome = d.get("citta") or nome_noto
        # film -> [(cinema, orari)]
        film = {}
        for s in d.get("sale") or []:
            for f in s.get("f", []):
                film.setdefault(f["t"], []).append((s, f.get("o", [])))
        if not film:
            vuote.append((slug, nome))
            urls.append(pagina_cinema_vuota(slug, nome))
            continue
        citta_ok.append((slug, nome, len(d["sale"]), len(film)))
        ord_film = sorted(film.items(), key=lambda kv: (-len(kv[1]), kv[0]))
        righe = []
        for t, sale in ord_film:
            dove = "".join(
                f'<div class="sala"><a href="{esc(s.get("url", "#"))}" rel="nofollow noopener">{esc(s["n"])}</a>'
                f'<div class="ore">{"".join(f"<span>{esc(o)}</span>" for o in orari)}</div></div>'
                for s, orari in sale)
            righe.append(f'<div class="it"><div class="ph">🎬</div><div><h3>{esc(t)}</h3>'
                         f'<div class="rg">In {len(sale)} {"cinema" if len(sale) > 1 else "cinema"}</div>{dove}</div></div>')
        elenco_sale = "".join(f'<li><a href="{esc(s.get("url", "#"))}" rel="nofollow noopener">{esc(s["n"])}</a>'
                              f' – {esc(s.get("ind", ""))}</li>' for s in d["sale"])
        h1 = f"Cinema a {nome}: film e orari di oggi"
        title = f"Cinema {nome}: film in sala e orari oggi, {etichetta} | Popcorno"
        primi = ", ".join(t for t, _ in ord_film[:4])
        desc = (f"Cosa danno al cinema a {nome} oggi ({etichetta}): {primi}. "
                f"{len(film)} film in {len(d['sale'])} sale, con tutti gli orari.")[:300]
        nota = ""
        if d.get("agg") and d["agg"] != oggi:
            nota = f' Orari aggiornati al {d["agg"][8:10]}/{d["agg"][5:7]}: verifica con il cinema.'
        corpo = (f'<p class="lead">{len(film)} film in programmazione oggi, {esc(etichetta)}, '
                 f'in {len(d["sale"])} cinema di {esc(nome)}.{esc(nota)}</p>'
                 f'<a class="cta" href="/">🍿 Scegli il film giusto per te</a>'
                 + "".join(righe)
                 + f'<h2>Le sale di {esc(nome)}</h2><ul style="padding-left:20px">{elenco_sale}</ul>'
                 + '<p class="lead" style="margin-top:20px"><a href="/cinema/">← Tutte le città</a></p>')
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebPage", "name": h1, "url": f"{BASE}/cinema/{slug}/", "inLanguage": "it", "dateModified": oggi},
            {"@type": "ItemList", "name": f"Film al cinema a {nome}", "numberOfItems": len(film),
             "itemListElement": [{"@type": "ListItem", "position": i + 1, "item": {"@type": "Movie", "name": t}}
                                 for i, (t, _) in enumerate(ord_film[:50])]},
            briciole(("Popcorno", "/"), ("Cinema", "/cinema/"), (nome, f"/cinema/{slug}/"))]}
        urls.append(pagina(f"cinema/{slug}", title, desc, h1, corpo, "cinema", ld))

    voci = [(n, f'<a href="/cinema/{s}/">{esc(n)} <span>· {nf} film</span></a>') for s, n, ns, nf in citta_ok]
    voci += [(n, f'<a href="/cinema/{s}/">{esc(n)} <span>· orari non disponibili oggi</span></a>') for s, n in vuote]
    lista = "".join(v for _, v in sorted(voci))
    corpo = (f'<p class="lead">Film in sala e orari di oggi, {esc(etichetta)}, in {len(citta_ok)} città italiane. '
             f'Scegli la tua città.</p><a class="cta" href="/">🍿 Scegli cosa vedere stasera</a>'
             f'<div class="citta">{lista}</div>')
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "name": "Cinema: film e orari di oggi", "url": f"{BASE}/cinema/", "inLanguage": "it"},
        briciole(("Popcorno", "/"), ("Cinema", "/cinema/"))]}
    urls.insert(0, pagina("cinema", f"Cinema oggi: film e orari in {len(citta_ok)} città | Popcorno",
                          f"Programmazione dei cinema di oggi ({etichetta}) a "
                          f"{', '.join(n for _, n, _, _ in sorted(citta_ok, key=lambda c: -c[2])[:5])} e "
                          f"in altre città: film in sala e orari.",
                          "Cinema: film e orari di oggi", corpo, "cinema", ld))
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
