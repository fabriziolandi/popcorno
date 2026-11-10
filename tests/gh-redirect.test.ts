// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseProfileHash, SYNC_KEYS } from "../src/lib/profile-link";

const html = readFileSync("gh-redirect/index.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];

// Esegue lo script della pagina con un localStorage e un location finti; restituisce la destinazione.
function run(stored: string | null, throwOnRead = false): string {
  document.body.innerHTML = '<a id="vai" href="https://popcorno.it/"></a>';
  let dest = "";
  const storage = { getItem: () => { if (throwOnRead) throw new Error("bloccato"); return stored; } };
  const loc = { replace: (u: string) => { dest = u; } };
  new Function("localStorage", "location", script)(storage, loc);
  expect(document.getElementById("vai")!.getAttribute("href")).toBe(dest);
  return dest;
}

describe("pagina del vecchio indirizzo GitHub Pages", () => {
  it("porta le preferenze a popcorno.it con #profilo=, leggibili dall'app", () => {
    const st = {
      tempo: "130", chi: "famiglia", umore: ["relax"], tipo: "film", gen: ["Commedia"], free: true,
      subs: ["netflix", "dazn"], team: "Juventus", citta: "Forlì", likes: { Commedia: 2 },
      liked: ["Friends"], disliked: ["Lost"], seen: ["Dune"], watch: [{ t: "Perfect Days", y: 2023 }], serie: [{ t: "Friends", s: 2, e: 5 }],
      aree: ["asia", "italia"],
    };
    const dest = run(JSON.stringify(st));
    expect(dest.startsWith("https://popcorno.it/#profilo=")).toBe(true);
    const back = parseProfileHash(dest.slice(dest.indexOf("#")))!;
    for (const k of SYNC_KEYS) expect(back[k]).toEqual(st[k as keyof typeof st]);
  });

  it("la pagina usa le stesse chiavi del link profilo dell'app, nello stesso ordine", () => {
    const keys = JSON.parse(script.match(/var SYNC_KEYS = (\[[^\]]*\]);/)![1]);
    expect(keys).toEqual([...SYNC_KEYS]);
  });

  it("senza preferenze, o con preferenze rotte o illeggibili, porta alla home", () => {
    expect(run(null)).toBe("https://popcorno.it/");
    expect(run("{non è json")).toBe("https://popcorno.it/");
    expect(run("42")).toBe("https://popcorno.it/");
    expect(run(null, true)).toBe("https://popcorno.it/");
  });

  it("senza JavaScript porta comunque a popcorno.it e non viene indicizzata", () => {
    expect(html).toContain('<meta http-equiv="refresh" content="0;url=https://popcorno.it/">');
    expect(html).toContain('<meta name="robots" content="noindex">');
  });
});
