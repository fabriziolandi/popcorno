# Popcorno 🍿

Ti dice cosa guardare stasera: TV in chiaro, Sky/NOW, Pluto TV e Samsung TV Plus, le piattaforme streaming (catalogo completo per l'Italia) e i film al cinema.

Sito: https://fabriziolandi.github.io/popcorno/

## Come si aggiorna
- `scripts/guida.py`: legge la guida TV di oggi (canali in chiaro, Sky, sport) da superguidatv.it e scrive `data/tv.json`.
- `.github/workflows/aggiorna.yml`: tre volte al giorno (7:40, 15:10, 18:20) legge la guida TV, scarica Pluto TV/Samsung TV Plus, i dati TMDB (più visti, novità, film al cinema, voti) e il catalogo completo, poi rigenera `data/oggi.js`, `data/catalogo/` e `data/trame/`.
- Serve il secret `TMDB_KEY` (Settings → Secrets and variables → Actions).

Dati di film e serie: [TMDB](https://www.themoviedb.org). Questo prodotto usa le API di TMDB ma non è approvato né certificato da TMDB.
