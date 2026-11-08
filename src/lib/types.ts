export type TitleRef = { t: string; tmdb?: string };
export type SerieRef = { t: string; tmdb: string; s: number; e: number };

export type Stasera = {
  tempo: string;
  chi: string;
  umore: string[];
  tipo: string;
  gen: string[];
  free: boolean;
  subs: string[];
  team: string;
  citta: string;
  likes: Record<string, number>;
  liked: string[];
  disliked: string[];
  seen: string[];
  watch: TitleRef[];
  serie: SerieRef[];
};

// Un titolo, come letto da public/data/tv.json e da fromRow dell'app vecchia.
export type Item = {
  t: string;
  ty: string;
  s: string;
  also?: string[];
  m: string[];
  w: string[];
  g: string;
  v?: number;
  vc?: number;
  pop?: number;
  time?: string;
  dur?: number;
  cat?: number;
  teams?: string[];
  kids?: number;
  nuovo?: boolean | number;
  tmdb?: string;
  p?: string;
  d?: string;
  l?: string;
  gs?: number[];
  y?: number | string;
  uscita?: string;
  c?: string[];
  e?: string;
};
