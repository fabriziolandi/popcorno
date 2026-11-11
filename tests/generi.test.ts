import { describe, expect, it } from "vitest";
import { genHit, genOk } from "../src/lib/genres";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Item, Stasera } from "../src/lib/types";

const st = (gen: string[]): Stasera => ({ ...structuredClone(DEFAULT_STATE), gen });
// Riga del catalogo Netflix dell'11/11: generi TMDB Avventura, Animazione, Famiglia.
const swapped: Item = { t: "Swapped - Al tuo posto", ty: "film", s: "netflix", m: [], w: [], g: "Avventura", gs: [12, 16, 10751] };
const azione: Item = { t: "X", ty: "film", s: "netflix", m: [], w: [], g: "Azione", gs: [28, 53] };
const cartoni: Item = { t: "Y", ty: "serie", s: "rai2", m: [], w: [], g: "Cartoni animati" };

describe("Che genere?", () => {
  it("un film d'animazione non esce se si sceglie solo azione e giallo", () => {
    expect(genOk(swapped, st(["azione", "giallo"]))).toBe(false);
    expect(genOk(cartoni, st(["azione"]))).toBe(false);
  });
  it("esce se si sceglie animazione o se non si sceglie nessun genere", () => {
    expect(genOk(swapped, st(["animazione"]))).toBe(true);
    expect(genOk(swapped, st(["azione", "animazione"]))).toBe(true);
    expect(genOk(swapped, st([]))).toBe(true);
  });
  it("conta tutti i generi del titolo, non solo il primo", () => {
    expect(genHit("giallo", azione)).toBe(true);   // Thriller è il secondo genere
    expect(genOk(azione, st(["giallo"]))).toBe(true);
  });
});
