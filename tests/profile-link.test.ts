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

  it("syncLink dell'app vecchia è letto da parseProfileHash", () => {
    const hash = legacyLink.slice(legacyLink.indexOf("#"));
    const p = parseProfileHash(hash)!;
    for (const k of SYNC_KEYS) expect(p[k]).toEqual(st[k]);
    expect(p.citta).toBe("Forlì");
  });
  it("profileLink produce la stessa stringa di syncLink", () => {
    expect(profileLink(st, "https://popcorno.it/")).toBe(legacyLink);
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
