import { allSrc } from "./sources";
import type { Item, Stasera } from "./types";

// Domande della vista Scegli: [valore, etichetta] (umore: [valore, emoji, etichetta]).
export const Q: Record<string, string[][]> = {
  tempo:[["90","Un'ora e mezza"],["130","Circa 2 ore"],["999","Tutta la sera"]],
  chi:[["solo","Da solo"],["coppia","In coppia"],["famiglia","In famiglia"],["amici","Con gli amici"]],
  umore:[["risate","😂","Ridere"],["emozione","🥹","Emozione"],["tensione","😬","Tensione"],["relax","😌","Relax"],["sport","⚽","Sport"]],
  tipo:[["tutto","Sorprendimi"],["film","Film"],["serie","Serie"],["show","Show"],["sport","Sport"],["cinema","🎟️ Al cinema"]]
};
export const GEN: Record<string, [string, RegExp | null]> = {horror:["👻 Horror",/horror/i],western:["🤠 Western",/western/i],commedia:["😂 Commedia",/commedia|satira|sitcom/i],
  azione:["💥 Azione",/azione|avventura|guerra/i],giallo:["🔎 Giallo e thriller",/giallo|thriller|crime|mistero|polizi|legal|cronaca/i],
  fanta:["🚀 Fantascienza e fantasy",/fantascienza|fantasy/i],romantico:["💕 Romantico",/romantic/i],drammatico:["🎭 Drammatico",/dramm/i],
  animazione:["🧸 Animazione",/animazione|cartoni|bambini|ragazzi|famiglia/i],documentario:["🌍 Documentari",/document|viaggi|storic/i],
  reality:["🏠 Reality e talent",/reality|talent|cucina/i],essai:["🎞️ D'essai",null]};
Q.gen = Object.entries(GEN).map(([k, v]) => [k, v[0]]);

export const MOODW: Record<string, string> = {risate:"ridere",emozione:"emozionarti",tensione:"un po' di tensione",relax:"rilassarti",sport:"sport"};
export const CHIW: Record<string, string> = {solo:"da solo",coppia:"in coppia",famiglia:"in famiglia",amici:"con gli amici"};
export const TEAMS = ["Nessuna","Atalanta","Bologna","Cagliari","Como","Fiorentina","Frosinone","Genoa","Inter","Juventus","Lazio","Lecce","Milan","Monza","Napoli","Parma","Roma","Sassuolo","Torino","Udinese","Venezia","Italia"];
export const POP_LANG = new Set(["hi","te","ta","kn","ml"]);
export const ARTE = new Set(["Drammatico","Storico","Documentario","Guerra","Musicale","Mistero","Crime","Thriller","Commedia","Western","Giallo"]);
export const ARTE_EN = new Set(["Drammatico","Storico","Documentario","Guerra","Mistero","Crime","Musicale"]);
export const TYW: Record<string, string> = {film:"Film",serie:"Serie",show:"Show",sport:"Sport in diretta",cinema:"Film in sala"};
export const CITTA = ["Roma","Milano","Napoli","Torino","Palermo","Genova","Bologna","Firenze","Bari","Catania","Venezia","Verona","Messina","Padova","Trieste","Brescia","Parma","Taranto","Prato","Modena","Reggio Calabria","Reggio Emilia","Perugia","Ravenna","Livorno","Cagliari","Foggia","Rimini","Salerno","Ferrara","Sassari","Latina","Monza","Siracusa","Pescara","Bergamo","Trento","Vicenza","Terni","Bolzano","Novara","Piacenza","Ancona","Andria","Udine","Arezzo","Cesena","Lecce","Pesaro","La Spezia","Como","Pisa","Lucca","Treviso","Varese","Caserta","Cosenza","Catanzaro","Potenza","L'Aquila","Campobasso","Aosta","Matera","Benevento","Avellino","Siena","Viterbo","Frosinone","Agrigento","Trapani","Ragusa"];

// Generi TMDB → [genere, umori, emoji, colori] (titoli del catalogo completo).
export const GT: Record<number, [string, string[], string, [string, string]]> = {28:["Azione",["tensione"],"💥",["#cb2d3e","#ef473a"]],12:["Avventura",["emozione","tensione"],"🗺️",["#f7971e","#c94b4b"]],16:["Animazione",["risate","emozione"],"🎨",["#56ccf2","#2f80ed"]],35:["Commedia",["risate","relax"],"😂",["#f7971e","#ffd200"]],80:["Crime",["tensione"],"🕵️",["#232526","#414345"]],99:["Documentario",["relax"],"🌍",["#56ab2f","#a8e063"]],18:["Drammatico",["emozione"],"🎭",["#41295a","#2f0743"]],10751:["Famiglia",["risate","relax"],"👨‍👩‍👧",["#74ebd5","#9face6"]],14:["Fantasy",["emozione","tensione"],"🐉",["#3a1c71","#d76d77"]],36:["Storico",["emozione"],"📜",["#3e5151","#decba4"]],27:["Horror",["tensione"],"👻",["#1a0000","#7a0000"]],10402:["Musicale",["emozione","relax"],"🎵",["#c31432","#240b36"]],9648:["Mistero",["tensione"],"🔎",["#141e30","#243b55"]],10749:["Romantico",["emozione","relax"],"💕",["#a8577e","#f1a7a1"]],878:["Fantascienza",["tensione","emozione"],"🚀",["#0f2027","#2c5364"]],53:["Thriller",["tensione"],"😬",["#232526","#5b5e49"]],10752:["Guerra",["tensione","emozione"],"🎖️",["#3a3a1c","#6b6b3a"]],37:["Western",["tensione"],"🤠",["#8e5b2e","#d9a35b"]],10759:["Azione",["tensione"],"💥",["#cb2d3e","#ef473a"]],10762:["Per bambini",["risate","relax"],"🧸",["#56ccf2","#2f80ed"]],10765:["Fantascienza",["tensione","emozione"],"🚀",["#0f2027","#2c5364"]],10764:["Reality",["relax","risate"],"🏠",["#ff512f","#dd2476"]],10766:["Soap",["emozione","relax"],"💌",["#ee9ca7","#ffdde1"]],10768:["Politica",["tensione"],"🏛️",["#283048","#859398"]],10763:["Attualità",["relax"],"📰",["#283048","#859398"]],10767:["Talk show",["relax"],"🎙️",["#283048","#859398"]]};
export const KIDG = new Set([16, 10751, 10762]);

export function isEssai(it: Item): boolean {
  if(it.ty!=="film"&&it.ty!=="cinema") return false;
  if(allSrc(it).includes("mubi")) return true;           // tutto il catalogo MUBI
  if(!it.v||it.vc===undefined||!it.l) return false;
  if((it.gs||[]).includes(10402) || POP_LANG.has(it.l)) return false;   // niente film-concerto né grandi produzioni commerciali
  if(it.l!=="en") return ARTE.has(it.g) && it.v>=7.2 && it.vc>=50 && it.vc<=5000;   // cinema non anglofono d'autore
  return ARTE_EN.has(it.g) && it.v>=7.6 && it.vc>=200 && it.vc<=3000;              // indipendente in inglese
}
export const genHit = (k: string, it: Item): boolean => (k === "essai" ? isEssai(it) : GEN[k][1]!.test(it.g));
export const genOk = (it: Item, st: Stasera): boolean => !st.gen.length || st.gen.some((k) => genHit(k, it));
export const wantEssai = (st: Stasera): boolean => st.gen.includes("essai");
