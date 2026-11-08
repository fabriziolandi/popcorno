// Le stringhe `why` (e simili) dell'app vecchia finivano in innerHTML. Qui si interpreta solo
// <b>…</b>, reso come <b> perché il CSS copiato lo stila (.why b, .lead b); tutto il resto è testo.
// Niente dangerouslySetInnerHTML.
export function Why({ html }: { html: string }) {
  const parts = html.split(/<b>(.*?)<\/b>/);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}
