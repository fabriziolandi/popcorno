// ---------- MI SENTO FORTUNATO: una sola proposta dai gusti del profilo (righe 719–758 dell'app vecchia) ----------
import { areaOk } from "./aree";
import { genOk } from "./genres";
import { isoDay, nowHM } from "./data";
import { epTxt, type Scored } from "./scoring";
import { available, isFree, mySrc, SRC } from "./sources";
import { inWatch, serieOf } from "./state";
import type { Item, Stasera } from "./types";

export const elenco = (a: string[]): string => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);

// `items` = tutti i titoli (C dell'app vecchia: palinsesto + on demand + cataloghi), `palDate` = PAL.data,
// `skip` = titoli già scartati con "Un'altra proposta", `now` e `random` = ora e Math.random del dispositivo.
export function lucky(
  items: Item[], st: Stasera, opts: { now: Date; palDate: string; skip: Set<string>; random: () => number },
): Scored | null {
  const d=opts.now, iso=isoDay(d);
  const now=nowHM(d), live=opts.palDate===iso;
  const kidsOk=(st.likes["Animazione"]||0)>0||(st.likes["Famiglia"]||0)>0||(st.likes["Cartoni"]||0)>0;
  const likedG=new Set(items.filter(x=>st.liked.includes(x.t)).map(x=>x.g));
  const scored: Scored[]=[];
  for(const it of items){
    if(it.ty==="cinema"||!available(it,st)||st.disliked.includes(it.t)||(st.seen.includes(it.t)&&!serieOf(st,it))||opts.skip.has(it.t)) continue;
    if(it.time){ if(!live) continue; const [hh,mm]=it.time.split(":").map(Number); const late=hh<5; if(!late && it.time<now && (d.getTime()-new Date(d.getFullYear(),d.getMonth(),d.getDate(),hh,mm).getTime())>15*60000) continue; }
    if(!areaOk(it,st)) continue;
    // come l'app vecchia: v o pop assenti rendono il confronto falso
    if(it.cat && ((it.v as number)<6.8 || (it.pop as number)<10)) continue;
    if(it.w.length===1 && it.w[0]==="famiglia" && !kidsOk) continue;
    // Novità rispetto all'app vecchia: niente titoli per bambini se non si guarda in famiglia e non
    // piacciono i cartoni; si rispettano "Film, serie o altro?" e "Che genere?" della pagina.
    if(it.kids && !kidsOk && st.chi!=="famiglia") continue;
    if(st.tipo!=="tutto" && st.tipo!=="cinema" && it.ty!==st.tipo) continue;
    if(it.ty!=="sport" && !genOk(it,st)) continue;
    let sc=0; const why: string[]=[];
    if(inWatch(st,it)){ sc+=5; why.push("è nella tua lista <b>Da vedere</b>"); }
    const sr=serieOf(st,it); if(sr){ sc+=4; why.unshift("la stai seguendo: tocca a <b>"+epTxt(sr)+"</b>"); }
    const gl=st.likes[it.g]||0;
    if(gl>0){ sc+=2.5*gl; why.push("ti piace il genere <b>"+it.g.toLowerCase()+"</b>"); } else if(gl<0) sc+=2*gl;
    if(likedG.has(it.g) && gl<=0){ sc+=1.5; }
    if(it.ty==="sport"){
      if(it.teams && st.team!=="Nessuna" && it.teams.includes(st.team)){ sc+=14; why.unshift("gioca <b>"+st.team+"</b>"); }
      else continue;
    }
    const ve = it.v ? (it.vc!==undefined ? (it.v*it.vc+6.5*150)/(it.vc+150) : it.v) : 0;   // voto pesato sul numero di voti
    if(ve){ sc+=(ve-6.5)*2.2; if(ve>=7.3) why.push("ha un voto alto, <b>★ "+it.v+"</b>"); } else if(it.ty!=="sport") sc-=1.5;
    if(it.pop) sc+=Math.min(2.5,Math.log10(it.pop+1)*0.8);
    if(it.time){ sc+=1.5; why.push("va in onda stasera alle <b>"+it.time+"</b> su "+SRC[mySrc(it,st)[0]].n); }
    else why.push("è disponibile su <b>"+elenco(mySrc(it,st).map(k=>SRC[k].n))+"</b>, che hai già");
    if(it.nuovo){ sc+=1; why.push("è una <b>novità</b>"); }
    if(isFree(it) && it.time) why.push("è <b>gratis</b>");
    scored.push({it,sc,why});
  }
  scored.sort((a,b)=>b.sc-a.sc);
  if(!scored.length) return null;
  const top=scored.slice(0,6), w=top.map((_,i)=>6-i), tot=w.reduce((a,b)=>a+b,0);
  let r=opts.random()*tot, pick=top[0];
  for(let i=0;i<top.length;i++){ r-=w[i]; if(r<=0){ pick=top[i]; break; } }
  return pick;
}
