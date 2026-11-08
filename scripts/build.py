#!/usr/bin/env python3
"""Compone palinsesto.js.
Uso: python3 build.py meta.json items.json tmdb.json > palinsesto.js
meta.json = {"data","etichetta","aggiornato","fonti"}; items.json = item TV+sport+Pluto/Samsung;
tmdb.json = output di tmdb.py (o {} se TMDB non e' raggiungibile).
Con --json (python3 build.py --json meta.json items.json tmdb.json > oggi.json) stampa solo il JSON."""
import sys, json
args = sys.argv[1:]
solo_json = bool(args) and args[0] == "--json"
if solo_json: args = args[1:]
meta, items, tm = (json.load(open(p, encoding="utf-8")) for p in args[:3])
voti = tm.get("voti", {})
for it in items:
    if it.get("t") in voti: it.update(voti[it["t"]])
meta["items"] = items
meta["ondemand"] = tm.get("ondemand", [])
meta["cinema"] = tm.get("cinema", [])
if meta["ondemand"]: meta["fonti"] = list(dict.fromkeys(meta.get("fonti", []) + ["TMDB"]))
if solo_json:
    print(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    sys.exit(0)
print("// Popcorno: palinsesto di oggi, rigenerato in automatico.")
print("window.PALINSESTO = " + json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + ";")
