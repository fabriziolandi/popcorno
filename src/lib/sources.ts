import type { Item, Stasera } from "./types";

// ---------- FONTI (n = numero sul telecomando) ----------
export type Source = { n: string; free?: number; lcn?: number; via?: string; sala?: number };

export const SRC: Record<string, Source> = {
  rai1:{n:"Rai 1",free:1,lcn:1}, rai2:{n:"Rai 2",free:1,lcn:2}, rai3:{n:"Rai 3",free:1,lcn:3}, r4:{n:"Rete 4",free:1,lcn:4},
  c5:{n:"Canale 5",free:1,lcn:5}, i1:{n:"Italia 1",free:1,lcn:6}, la7:{n:"La7",free:1,lcn:7}, tv8:{n:"TV8",free:1,lcn:8}, nove:{n:"Nove",free:1,lcn:9},
  venti:{n:"20 Mediaset",free:1,lcn:20}, rai4:{n:"Rai 4",free:1,lcn:21}, iris:{n:"Iris",free:1,lcn:22}, rai5:{n:"Rai 5",free:1,lcn:23},
  raimovie:{n:"Rai Movie",free:1,lcn:24}, raipremium:{n:"Rai Premium",free:1,lcn:25}, cielo:{n:"Cielo",free:1,lcn:26},
  la5:{n:"La5",free:1,lcn:30}, realtime:{n:"Real Time",free:1,lcn:31}, cine34:{n:"Cine34",free:1,lcn:34}, focus:{n:"Focus",free:1,lcn:35},
  giallo:{n:"Giallo",free:1,lcn:38}, topcrime:{n:"Top Crime",free:1,lcn:39}, boing:{n:"Boing",free:1,lcn:40}, raigulp:{n:"Rai Gulp",free:1,lcn:42},
  raiyoyo:{n:"Rai YoYo",free:1,lcn:43}, cartoonito:{n:"Cartoonito",free:1,lcn:46}, italia2:{n:"Italia 2",free:1,lcn:49}, dmax:{n:"DMAX",free:1,lcn:52},
  raistoria:{n:"Rai Storia",free:1,lcn:54}, raisport:{n:"Rai Sport",free:1,lcn:58},
  raiplay:{n:"RaiPlay",free:1}, infinity:{n:"Mediaset Infinity",free:1}, pluto:{n:"Pluto TV",free:1}, samsung:{n:"Samsung TV Plus",free:1}, rakuten:{n:"Rakuten TV",free:1},
  skyuno:{n:"Sky Uno",lcn:108,via:"now"}, skyatlantic:{n:"Sky Atlantic",lcn:111,via:"now"}, skyserie:{n:"Sky Serie",lcn:112,via:"now"},
  skyinv:{n:"Sky Investigation",lcn:113,via:"now"}, skycrime:{n:"Sky Crime",lcn:115,via:"now"}, history:{n:"History",lcn:116,via:"now"},
  skydocs:{n:"Sky Documentaries",lcn:117,via:"now"}, skynature:{n:"Sky Nature",lcn:119,via:"now"}, skyarte:{n:"Sky Arte",lcn:120,via:"now"},
  skycin1:{n:"Sky Cinema Uno",lcn:301,via:"now"}, skycin2:{n:"Sky Cinema Due",lcn:302,via:"now"}, skycoll:{n:"Sky Cinema Collection",lcn:303,via:"now"},
  skyfam:{n:"Sky Cinema Family",lcn:304,via:"now"}, skyact:{n:"Sky Cinema Action",lcn:305,via:"now"}, skysus:{n:"Sky Cinema Suspense",lcn:306,via:"now"},
  skyrom:{n:"Sky Cinema Romance",lcn:307,via:"now"}, skydra:{n:"Sky Cinema Drama",lcn:308,via:"now"}, skycom:{n:"Sky Cinema Comedy",lcn:309,via:"now"},
  skycin24:{n:"Sky Cinema Uno +24",lcn:310,via:"now"}, cinema:{n:"Al cinema",sala:1},
  netflix:{n:"Netflix"}, prime:{n:"Prime Video"}, disney:{n:"Disney+"}, hbo:{n:"HBO Max"}, apple:{n:"Apple TV+"},
  paramount:{n:"Paramount+"}, timvision:{n:"TIMvision"}, infinityplus:{n:"Infinity+"}, crunchyroll:{n:"Crunchyroll"}, mubi:{n:"MUBI"}, now:{n:"Sky / NOW"}, dazn:{n:"DAZN"}
};

// I 3 titoli on demand di ripiego, quando il palinsesto non ne ha.
export const OD: Item[] = [
 {t:"Up",ty:"film",s:"disney",dur:96,m:["emozione","risate"],w:["famiglia"],kids:1,g:"Animazione",e:"🎈",c:["#56ccf2","#2f80ed"],d:"Una casa che vola appesa ai palloncini."},
 {t:"Mare fuori",ty:"serie",s:"raiplay",dur:50,m:["emozione","tensione"],w:["solo","coppia","amici"],g:"Drammatico",e:"🌊",c:["#1e3c72","#2a5298"],d:"Il carcere minorile di Napoli."},
 {t:"Stranger Things",ty:"serie",s:"netflix",dur:50,m:["tensione","risate"],w:["amici","famiglia","solo"],g:"Fantascienza",e:"🚲",c:["#6a0000","#e52d27"],d:"Anni '80, mostri e amicizia."}
];

export const allSrc = (it: Item): string[] => [it.s, ...(it.also || [])].filter((k) => SRC[k]);
export const isFree = (it: Item): boolean => allSrc(it).some((k) => SRC[k].free);
export const has = (k: string, st: Stasera): boolean =>
  !!(SRC[k].free || SRC[k].sala || st.subs.includes(k) || (SRC[k].via && st.subs.includes(SRC[k].via!)));
export const mySrc = (it: Item, st: Stasera): string[] => { const m = allSrc(it).filter((k) => has(k, st)); return m.length ? m : allSrc(it); };
export const available = (it: Item, st: Stasera): boolean => allSrc(it).some((k) => has(k, st));
