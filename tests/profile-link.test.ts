import { describe, expect, it } from "vitest";
import { parseProfileHash, profileLink, SYNC_KEYS } from "../src/lib/profile-link";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Stasera } from "../src/lib/types";
import { loadLegacy } from "./legacy/harness";

const st: Stasera = {
  ...DEFAULT_STATE, citta: "Forlì", team: "Roma", umore: ["relax", "ridere"], gen: ["essai"],
  likes: { Horror: -1, Commedia: 3 }, liked: ["È stata la mano di Dio"], watch: [{ t: "Dune", tmdb: "movie/438631" }],
  serie: [{ t: "Dark", tmdb: "tv/70523", s: 2, e: 5 }],
};

describe("link profilo vs app vecchia", () => {
  const w = loadLegacy(undefined, st);
  const legacyLink: string = w.syncLink();

  // L'app vecchia non ha "Da dove?" (aree, in fondo alle chiavi): il suo link non la porta,
  // e il nostro è il suo con in più aree.
  const payload = (link: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(link.slice(link.indexOf("=") + 1)), (c) => c.charCodeAt(0))));
  it("syncLink dell'app vecchia è letto da parseProfileHash", () => {
    const hash = legacyLink.slice(legacyLink.indexOf("#"));
    const p = parseProfileHash(hash)!;
    for (const k of SYNC_KEYS) if (k !== "aree") expect(p[k]).toEqual(st[k]);
    expect(p.citta).toBe("Forlì");
    expect("aree" in p).toBe(false); // l'import lascia le aree del dispositivo
  });
  it("profileLink produce la stringa di syncLink, con in più le aree in fondo", () => {
    const ours = profileLink(st, "https://popcorno.it/");
    expect(ours.startsWith("https://popcorno.it/#profilo=")).toBe(true);
    const mine = payload(ours), old = payload(legacyLink);
    expect(Object.keys(mine)).toEqual([...Object.keys(old), "aree"]);
    expect(mine).toEqual({ ...old, aree: [] });
    expect(profileLink({ ...st, aree: undefined } as unknown as Stasera, "https://popcorno.it/")).toBe(legacyLink);
  });
});

describe("profilo molto grande", () => {
  it("oltre 100 KB: nessun RangeError e torna uguale da parseProfileHash", () => {
    const big: Stasera = { ...st, seen: Array.from({ length: 6000 }, (_, i) => "Titolo visto numero " + i + " – è così") };
    const link = profileLink(big, "https://popcorno.it/");
    expect(link.length).toBeGreaterThan(100_000);
    const p = parseProfileHash(link.slice(link.indexOf("#")))!;
    expect(p.seen).toEqual(big.seen);
    expect(p.citta).toBe("Forlì");
  });
});

describe("link profilo: aree", () => {
  it("aree è l'ultima chiave sincronizzata e fa il giro completo", () => {
    expect(SYNC_KEYS[SYNC_KEYS.length - 1]).toBe("aree");
    const conAree: Stasera = { ...st, aree: ["asia", "europa"] };
    const link = profileLink(conAree, "https://popcorno.it/");
    const p = parseProfileHash(link.slice(link.indexOf("#")))!;
    for (const k of SYNC_KEYS) expect(p[k]).toEqual(conAree[k]);
    expect(p.aree).toEqual(["asia", "europa"]);
  });
});

describe("parseProfileHash", () => {
  it("hash estraneo: null", () => {
    expect(parseProfileHash("")).toBeNull();
    expect(parseProfileHash("#altro=1")).toBeNull();
  });
  it("link rotto: lancia", () => {
    expect(() => parseProfileHash("#profilo=@@@")).toThrow();
  });
  it("ignora chiavi non sincronizzate e campi mancanti", () => {
    const b = btoa(JSON.stringify({ citta: "Roma", free: true }));
    expect(parseProfileHash("#profilo=" + b)).toEqual({ citta: "Roma" });
  });
});
