// ---------- DATI: palinsesto, cataloghi, trame, orari dei cinema (righe 592–663 dell'app vecchia, senza DOM) ----------
import { GT, KIDG } from "./genres";
import { OD, SRC } from "./sources";
import type { Item, Stasera } from "./types";

export type Palinsesto = {
  data: string; etichetta: string; aggiornato: string; fonti: string[];
  items: Item[]; ondemand: Item[]; cinema: Item[];
};

// Forma di data/cinema/<slug>.json e di data/cinema/index.json (scripts/cinema.py).
export type CityShows = {
  citta: string; agg?: string;
  sale: { n: string; ind: string; url: string; f: { t: string; o: string[] }[] }[];
};
export type CinemaIndex = { agg?: string; citta: Record<string, { n: string; sale?: number; film?: number }> };
export type FilmShow = { n: string; ind: string; url: string; o: string[] };

// Riga di data/catalogo/<k>.json: [id, tipo (0 film, 1 serie), titolo, anno, voto, generi, popolarità, poster, numero voti, lingua].
export type CatalogRow = [number, number, string, number, number, number[], number, string, number, string];

const pad = (n: number) => String(n).padStart(2, "0");
export const nowHM = (d: Date = new Date()): string => pad(d.getHours()) + ":" + pad(d.getMinutes());
export const isoDay = (d: Date = new Date()): string => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

// Come DV() dell'app vecchia.
export const dataVersion = (pal: Palinsesto | null): string => "v=" + encodeURIComponent((pal && pal.aggiornato) || "0");

// Tutti i titoli fuori dalle sale (C dell'app vecchia): palinsesto, on demand (o i 3 di ripiego), cataloghi.
export const allItems = (pal: Palinsesto, extra: Item[] = []): Item[] =>
  pal.items.concat(pal.ondemand && pal.ondemand.length ? pal.ondemand : OD, extra);

// Stato della pagina, come le variabili globali dell'app vecchia; si azzera a ogni loadPalinsesto.
let version = "v=0";
let byTmdb = new Map<string, Item>();
let catCount = 0;
let plotCache: Record<number, Record<string, string>> = {};
let cindex: CinemaIndex | null = null;

const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

export async function loadPalinsesto(): Promise<Palinsesto> {
  let raw: any = null;
  try {
    const r = await fetch(`/data/oggi.json?t=${Math.floor(Date.now() / 600000)}`);
    if (r.ok) raw = await r.json();
  } catch { /* come senza data/oggi.js: palinsesto vuoto */ }
  raw = raw && typeof raw === "object" ? raw : {};
  const pal: Palinsesto = {
    data: raw.data || "", etichetta: raw.etichetta || "", aggiornato: raw.aggiornato || "", fonti: arr<string>(raw.fonti),
    items: arr<Item>(raw.items), ondemand: arr<Item>(raw.ondemand), cinema: arr<Item>(raw.cinema),
  };
  version = dataVersion(pal);
  byTmdb = new Map();
  allItems(pal).concat(pal.cinema).forEach((it) => { if (it.tmdb) byTmdb.set(it.tmdb, it); });
  catCount = 0;
  plotCache = {};
  cindex = null;
  return pal;
}

// Titoli letti dai cataloghi finora (somma delle righe, come catCount dell'app vecchia).
export const catalogCount = (): number => catCount;

// Un titolo dal catalogo `key`. Se il titolo c'è già (stesso tmdb) lo arricchisce e restituisce null.
export function fromRow(key: string, r: CatalogRow): Item | null {
  const [id,tp,t,y,v,gs,pop,p,vc,l]=r, kind=tp?"tv":"movie", tm=kind+"/"+id;
  const ex=byTmdb.get(tm);
  if(ex){ if(ex.s!==key && !(ex.also||[]).includes(key)) (ex.also=ex.also||[]).push(key); if(!ex.p&&p) ex.p=p; if(!ex.pop) ex.pop=pop; if(ex.vc===undefined) ex.vc=vc||0; if(!ex.l) ex.l=l||""; return null; }
  const g=GT[gs.find(x=>GT[x])!]||["Varie",["relax"],"🎬",["#614385","#516395"]];
  const kids=gs.some(x=>KIDG.has(x)) && !gs.includes(27) && !gs.includes(53);
  const it: Item={t,ty:tp?"serie":"film",s:key,dur:0,m:g[1],w:kids?["famiglia","coppia","amici"]:(["Horror","Thriller","Crime"].includes(g[0])?["solo","coppia"]:["solo","coppia","amici"]),g:g[0],e:g[2],c:g[3],d:"",v,vc:vc||0,l:l||"",gs,y,p,pop,tmdb:tm,cat:1};
  if(kids) it.kids=1;
  byTmdb.set(tm,it); return it;
}

// Cataloghi completi: le piattaforme gratuite senza canale (tranne Samsung) e gli abbonamenti (tranne DAZN).
// Un catalogo che manca o non si legge si salta. Restituisce i titoli nuovi, nell'ordine dell'app vecchia.
export async function loadCatalogs(st: Stasera): Promise<Item[]> {
  const keys=Object.keys(SRC).filter(k=>(SRC[k].free && !SRC[k].lcn && k!=="samsung") || (!SRC[k].free && !SRC[k].via && !SRC[k].sala && k!=="dazn" && st.subs.includes(k)));
  const out: Item[]=[];
  for(const k of keys){
    try{
      const r=await fetch(`/data/catalogo/${k}.json?${version}`); if(!r.ok) continue;
      const j=await r.json();
      for(const row of j.t){ const it=fromRow(k,row); if(it) out.push(it); }
      catCount+=j.t.length;
    }catch{ /* catalogo illeggibile: come oggi, si va avanti */ }
  }
  return out;
}

// Trama da data/trame/<id%100>.json; se manca, "Film del 2021." / "Serie." come oggi.
export async function loadPlot(it: Item): Promise<string> {
  if(!it.tmdb) return it.d || "";
  const [kind,id]=it.tmdb.split("/"); const k=(kind==="tv"?"t":"m")+id, b=(+id)%100;
  try{
    if(!plotCache[b]){ const r=await fetch(`/data/trame/${b}.json?${version}`); if(!r.ok) throw new Error(String(r.status)); plotCache[b]=await r.json(); }
  }catch{ plotCache[b]={}; }
  return plotCache[b][k]||(it.ty==="film"?"Film":"Serie")+(it.y?" del "+it.y:"")+".";
}

// ---------- ORARI DEI CINEMA (movieplayer.it, aggiornati ogni mattina) ----------
export const nrm = (s: string | null | undefined): string =>
  (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();

export async function loadCinemaIndex(): Promise<CinemaIndex | null> {
  if(cindex) return cindex;
  try{ const r=await fetch(`/data/cinema/index.json?${version}`); if(!r.ok) throw new Error(String(r.status)); cindex=await r.json(); }
  catch{ return null; }
  return cindex;
}

export async function loadCityShows(citta: string): Promise<CityShows | null> {
  const idx=await loadCinemaIndex(); if(!idx) return null;
  if(!citta) return null;
  const want=nrm(citta);
  const slug=Object.keys(idx.citta).find(k=>nrm(idx.citta[k].n)===want||nrm(k)===want);
  if(!slug) return null;
  try{ const r=await fetch(`/data/cinema/${slug}.json?${version}`); if(!r.ok) throw new Error(String(r.status)); return await r.json(); }
  catch{ return null; }
}

export function sameFilm(a: string, b: string): boolean { const x=nrm(a), y=nrm(b); if(!x||!y) return false; if(x===y) return true; const s=x.length<y.length?x:y, l=x.length<y.length?y:x; return s.length>=6 && (l.startsWith(s+" ")||l.startsWith(s)); }

export function filmShows(it: Item, shows: CityShows | null): FilmShow[] {
  if(!shows) return [];
  const out: FilmShow[]=[]; for(const s of shows.sale){ const f=s.f.find(f=>sameFilm(f.t,it.t)); if(f) out.push({n:s.n,ind:s.ind,url:s.url,o:f.o}); }
  return out;
}

export function nextTimes(it: Item, shows: CityShows | null, now: string = nowHM()): string[] {
  return [...new Set(filmShows(it,shows).flatMap(s=>s.o))].filter(o=>o>=now).sort();
}

// Come findRef dell'app vecchia: prima per tmdb (byTmdb: palinsesto e sale, a parità vince l'ultimo;
// poi i cataloghi), poi per titolo in tutti i titoli e nelle sale.
export function findRef(ref: { t: string; tmdb?: string }, pal: Palinsesto | null, extra: Item[] = []): Item | null {
  if(!pal) return null;
  const base=allItems(pal).concat(pal.cinema);
  if(ref.tmdb){
    let hit: Item | undefined; for(const it of base) if(it.tmdb===ref.tmdb) hit=it;
    hit=hit||extra.find(it=>it.tmdb===ref.tmdb);
    if(hit) return hit;
  }
  return allItems(pal, extra).concat(pal.cinema).find(x=>x.t===ref.t) || null;
}
