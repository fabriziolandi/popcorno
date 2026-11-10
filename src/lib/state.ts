import type { Item, SerieRef, Stasera, TitleRef } from "./types";

export const DEFAULT_STATE: Stasera = {
  tempo: "130", chi: "coppia", umore: ["relax"], tipo: "tutto", gen: [], aree: [], free: false,
  subs: ["netflix", "prime", "disney", "dazn"], team: "Nessuna", citta: "",
  likes: {}, liked: [], disliked: [], seen: [], watch: [], serie: [],
};

const fresh = (): Stasera => structuredClone(DEFAULT_STATE);

export function loadState(storage: Storage | null): Stasera {
  const st = fresh();
  try {
    const s = JSON.parse((storage as Storage).getItem("stasera") || "null");
    if (s) Object.assign(st, s);
  } catch {
    // JSON rotto o storage che lancia: come oggi, parte da zero (anche i campi già uniti)
    return fresh();
  }
  if (!Array.isArray(st.gen)) st.gen = [];
  if (!Array.isArray(st.aree)) st.aree = [];
  if (!Array.isArray(st.watch)) st.watch = [];
  if (!Array.isArray(st.serie)) st.serie = [];
  if (st.tipo === "essai") {
    st.tipo = "film";
    if (!st.gen.includes("essai")) st.gen.push("essai");
  }
  return st;
}

export function saveState(st: Stasera, storage: Storage | null): void {
  try { (storage as Storage).setItem("stasera", JSON.stringify(st)); } catch { /* navigazione privata */ }
}

export const refOf = (it: Item): TitleRef => (it.tmdb ? { t: it.t, tmdb: it.tmdb } : { t: it.t });
export const sameRef = (a: TitleRef, b: TitleRef): boolean => (a.tmdb && b.tmdb ? a.tmdb === b.tmdb : a.t === b.t);
export const inWatch = (st: Stasera, it: Item): boolean => st.watch.some((w) => sameRef(w, refOf(it)));
export const serieOf = (st: Stasera, it: Item): SerieRef | undefined =>
  it.ty === "serie" ? st.serie.find((x) => sameRef(x, refOf(it))) : undefined;

export function toggleWatch(st: Stasera, it: Item): Stasera {
  return inWatch(st, it)
    ? { ...st, watch: st.watch.filter((w) => !sameRef(w, refOf(it))) }
    : { ...st, watch: [...st.watch, refOf(it)] };
}

export function toggleSeen(st: Stasera, it: Item): Stasera {
  return st.seen.includes(it.t)
    ? { ...st, seen: st.seen.filter((x) => x !== it.t) }
    : { ...st, seen: [...st.seen, it.t] };
}

export function feedback(st: Stasera, it: Item, v: 1 | -1): Stasera {
  const likes = { ...st.likes, [it.g]: (st.likes[it.g] || 0) + v };
  if (v > 0) {
    return {
      ...st, likes,
      liked: st.liked.includes(it.t) ? st.liked : [...st.liked, it.t],
      disliked: st.disliked.filter((x) => x !== it.t),
      seen: st.seen.includes(it.t) ? st.seen : [...st.seen, it.t],
    };
  }
  return {
    ...st, likes,
    disliked: st.disliked.includes(it.t) ? st.disliked : [...st.disliked, it.t],
    liked: st.liked.filter((x) => x !== it.t),
  };
}
