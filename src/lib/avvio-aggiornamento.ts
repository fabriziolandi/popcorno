// Timer di Cloudflare (triggers.crons in wrangler.jsonc): avvia il workflow
// "Aggiorna dati Popcorno" su GitHub, che legge la guida e ripubblica il sito.
// Gli orari programmati di GitHub partono in ritardo o vengono saltati; quelli
// di Cloudflare sono puntuali.
//
// Serve il segreto del Worker GITHUB_TOKEN_AGGIORNA: token GitHub "fine-grained"
// limitato al repository popcorno, con il solo permesso Actions: Read and write.

export const REPO = "fabriziolandi/popcorno";
export const WORKFLOW = "aggiorna.yml";

export type EnvAggiornamento = { GITHUB_TOKEN_AGGIORNA?: string };

export async function avviaAggiornamento(env: EnvAggiornamento, fetcher: typeof fetch = fetch): Promise<void> {
  const token = env.GITHUB_TOKEN_AGGIORNA;
  if (!token) throw new Error("Manca il segreto GITHUB_TOKEN_AGGIORNA: aggiornamento non avviato");
  const res = await fetcher(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "popcorno-worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!res.ok) throw new Error(`GitHub ha rifiutato l'avvio: ${res.status} ${await res.text()}`);
}
