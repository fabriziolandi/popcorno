// ---------- MOTORE DI SCELTA (righe 373–415 dell'app vecchia) ----------
import { AREA, areaOf, areaOk, areeScelte } from "./aree";
import { filmShows, type CityShows, type Palinsesto, allItems } from "./data";
import { CHIW, GEN, genHit, genOk, isEssai, MOODW, wantEssai } from "./genres";
import { allSrc, available, isFree } from "./sources";
import { inWatch, serieOf } from "./state";
import type { Item, SerieRef, Stasera } from "./types";

// `why` contiene frammenti HTML con <b>…</b>, uguali a quelli dell'app vecchia.
export type Scored = { it: Item; sc: number; why: string[] };

export const epTxt = (x: SerieRef): string => `S${x.s} E${x.e}`;

export function score(it: Item, st: Stasera): { sc: number; why: string[] } {
  let sc=0; const why: string[]=[];
  const mm=it.m.filter(x=>st.umore.includes(x));
  if(mm.length){sc+=3*mm.length; why.push("hai voglia di <b>"+mm.map(x=>MOODW[x]).join(" e ")+"</b>")}
  if(st.gen.length && it.ty!=="sport" && genOk(it,st)) why.unshift("cercavi <b>"+st.gen.filter(k=>genHit(k,it)).map(k=>k==="essai"?"un film d'essai":GEN[k][0].replace(/^\S+\s/,"").toLowerCase()).join(" o ")+"</b>");
  if(it.w.includes(st.chi)){sc+=2; why.push("va bene da guardare <b>"+CHIW[st.chi]+"</b>")}
  if(st.chi==="famiglia" && it.kids){sc+=2}
  if(it.teams && st.team!=="Nessuna" && it.teams.includes(st.team)){sc+=8; why.unshift("gioca <b>"+st.team+"</b>")}
  if(it.time){sc+=1; why.push("inizia alle <b>"+it.time+"</b>")}
  if(isFree(it)) why.push("è <b>gratis</b>");
  const gl=st.likes[it.g]||0; if(gl){sc+=gl*1.5; if(gl>0) why.push("ti sono piaciuti altri titoli <b>"+it.g.toLowerCase()+"</b>")}
  if(st.disliked.includes(it.t)) sc-=20;
  if(st.seen.includes(it.t)) sc-=4;
  if(it.v){ sc+=(it.v-6.5)*0.8; if(it.v>=7.8) why.push("ha un voto alto, <b>"+it.v+"</b>"); }
  if(inWatch(st,it)){ sc+=4; why.unshift("è nella tua lista <b>Da vedere</b>"); }
  const sr=serieOf(st,it); if(sr){ sc+=3; why.unshift("la stai seguendo: tocca a <b>"+epTxt(sr)+"</b>"); }
  if(it.pop) sc+=Math.min(3,Math.log10(it.pop+1));
  if(wantEssai(st) && isEssai(it) && it.v){ const ve=(it.v*(it.vc||0)+7*300)/((it.vc||0)+300); sc+=(ve-7)*6; }
  if(wantEssai(st) && isEssai(it)){ if(allSrc(it).includes("mubi")) why.unshift("è nella selezione di <b>MUBI</b>"); else if(it.vc) why.unshift("è amato dalla critica (<b>"+it.vc+" voti</b>)"); }
  if(it.nuovo){ sc+=1; why.push("è appena uscito"); }
  // "Da dove?": il motivo dell'area si aggiunge solo se c'è posto (se ne mostrano 3).
  const ar=areaOf(it);
  if(ar && why.length<3 && it.ty!=="sport" && it.ty!=="show" && areeScelte(st).includes(ar)) why.push("viene <b>"+AREA[ar].da+"</b>");
  return {sc,why};
}

// `extra`: i titoli dei cataloghi completi (loadCatalogs), che l'app vecchia aggiungeva a C.
export function candidates(
  pal: Palinsesto, st: Stasera, opts: { noTime?: boolean; shows?: CityShows | null; extra?: Item[] } = {},
): Scored[] {
  const tmax=opts.noTime?9999:+st.tempo;
  const shows=opts.shows||null, CIN=pal.cinema;
  const pool = st.tipo==="cinema" ? (shows && shows.sale.length ? CIN.filter(it=>filmShows(it,shows).length) : CIN) : allItems(pal, opts.extra);
  return pool.filter(it=>{
    if(!available(it,st)) return false;
    if(st.free && st.tipo!=="cinema" && !isFree(it)) return false;
    if(st.tipo!=="tutto" && it.ty!==st.tipo) return false;
    if(st.tipo==="tutto" && it.ty==="sport" && !st.umore.includes("sport") && !(it.teams&&it.teams.includes(st.team))) return false;
    if(st.umore.length===1 && st.umore[0]==="sport" && it.ty!=="sport") return false;
    if(it.ty!=="serie" && it.dur && it.dur>tmax) return false;
    // come l'app vecchia: v o pop assenti rendono il confronto falso (undefined<6 === false)
    if(it.cat && ((it.v as number)<6 || (it.pop as number)<4) && st.tipo!=="cinema" && !(wantEssai(st) && isEssai(it))) return false;
    if(it.ty!=="sport" && !genOk(it,st)) return false;
    if(it.ty==="sport" && st.gen.length && !st.umore.includes("sport") && st.tipo!=="sport") return false;
    if(it.w.length===1 && it.w[0]==="famiglia" && st.chi!=="famiglia") return false;
    if(!areaOk(it,st)) return false;
    // i titoli già visti non si propongono più, tranne le serie che si stanno seguendo
    if(st.seen.includes(it.t) && !serieOf(st,it)) return false;
    return true;
  }).map(it=>({it,...score(it,st)})).sort((a,b)=>b.sc-a.sc);
}

// "Cosa guardo?": se nulla sta nel tempo disponibile, ripiega ignorando la durata.
export function pickNow(pal: Palinsesto, st: Stasera, shows: CityShows | null, extra: Item[] = []): Scored[] {
  let list=candidates(pal,st,{shows,extra});
  if(!list.length){ list=candidates(pal,st,{noTime:true,shows,extra}); list.forEach(x=>x.why.unshift("è il più adatto, anche se dura <b>più del tempo che hai</b>")); }
  return list;
}

// Varietà: a parità di risposte non si propone a tutti lo stesso titolo. Si rimescolano solo i titoli
// vicini al migliore (entro VARIA_PUNTI dal primo, e comunque i primi VARIA_MIN), con un rumore
// casuale (Gumbel, scala VARIA) che favorisce chi ha il punteggio più alto; gli altri seguono in
// ordine di punteggio. Restano sempre primi, nel loro ordine, la squadra del cuore, le serie che si
// stanno seguendo e i titoli della lista "Da vedere".
export const VARIA = 0.75, VARIA_PUNTI = 1.5, VARIA_MIN = 12;
export function varia(list: Scored[], st: Stasera, random: () => number = Math.random): Scored[] {
  const fisso=(x: Scored)=>!!(serieOf(st,x.it) || inWatch(st,x.it) || (x.it.teams && st.team!=="Nessuna" && x.it.teams.includes(st.team)));
  const gumbel=()=>{ const u=Math.min(Math.max(random(),1e-12),1-1e-12); return -Math.log(-Math.log(u)); };
  const altri=list.filter(x=>!fisso(x));
  const top=altri.length?altri[0].sc:0;
  const n=Math.max(VARIA_MIN, altri.filter(x=>x.sc>=top-VARIA_PUNTI).length);
  const misti=altri.slice(0,n).map(x=>({x,k:x.sc+VARIA*gumbel()})).sort((a,b)=>b.k-a.k).map(y=>y.x);
  return list.filter(fisso).concat(misti, altri.slice(n));
}
