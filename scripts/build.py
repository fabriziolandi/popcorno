#!/usr/bin/env python3
"""Compone palinsesto.js.
Uso: python3 build.py meta.json items.json tmdb.json > palinsesto.js
meta.json = {"data","etichetta","aggiornato","fonti"}; items.json = item TV+sport+Pluto/Samsung;
tmdb.json = output di tmdb.py (o {} se TMDB non e' raggiungibile)."""
import sys, json
meta, items, tm = (json.load(open(p)) for p in sys.argv[1:4])
voti = tm.get("voti", {})
for it in items:
    if it.get("t") in voti: it.update(voti[it["t"]])
meta["items"] = items
meta["ondemand"] = tm.get("ondemand", [])
meta["cinema"] = tm.get("cinema", [])
if meta["ondemand"]: meta["fonti"] = list(dict.fromkeys(meta.get("fonti", []) + ["TMDB"]))
print("// Popcorno: palinsesto di oggi, rigenerato in automatico.")
print("window.PALINSESTO = " + json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + ";")
