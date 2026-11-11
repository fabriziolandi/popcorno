import { describe, expect, it } from "vitest";
import { lucky } from "../src/lib/lucky";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Item, Stasera } from "../src/lib/types";

const NOW = new Date(2026, 10, 11, 21, 0);
const st = (p: Partial<Stasera> = {}): Stasera => ({ ...structuredClone(DEFAULT_STATE), ...p });
const run = (items: Item[], s: Stasera) => lucky(items, s, { now: NOW, palDate: "2026-11-11", skip: new Set(), random: () => 0 });
// Come la riga del catalogo RaiPlay: generi Per bambini, Animazione, Fantascienza.
const winx: Item = { t: "Winx Club", ty: "serie", s: "raiplay", m: ["risate", "relax"], w: ["famiglia", "coppia", "amici"], g: "Per bambini", gs: [10762, 16, 10765], kids: 1, v: 8, vc: 562, pop: 32, cat: 1 };
const film: Item = { t: "Un film", ty: "film", s: "raiplay", m: ["tensione"], w: ["solo", "coppia", "amici"], g: "Thriller", gs: [53], v: 7, vc: 300, pop: 20, cat: 1 };
const serie: Item = { t: "Una serie", ty: "serie", s: "raiplay", m: ["tensione"], w: ["solo", "coppia", "amici"], g: "Crime", gs: [80], v: 7.5, vc: 300, pop: 20, cat: 1 };

describe("🍀 Mi sento fortunato", () => {
  it("niente titoli per bambini se non si guarda in famiglia e non piacciono i cartoni", () => {
    expect(run([winx], st())).toBeNull();
    expect(run([winx], st({ chi: "famiglia" }))?.it.t).toBe("Winx Club");
    expect(run([winx], st({ likes: { Animazione: 1 } }))?.it.t).toBe("Winx Club");
  });
  it("rispetta \"Film, serie o altro?\"", () => {
    expect(run([serie, film], st({ tipo: "film" }))?.it.t).toBe("Un film");
    expect(run([film, serie], st({ tipo: "serie" }))?.it.t).toBe("Una serie");
  });
  it("rispetta \"Che genere?\"", () => {
    expect(run([serie, film], st({ gen: ["giallo"] }))).not.toBeNull();
    expect(run([film], st({ gen: ["commedia"] }))).toBeNull();
  });
});
