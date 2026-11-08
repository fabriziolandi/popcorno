// Quali cache cancellare all'attivazione: solo le vecchie `popcorno-*`.
// La stessa logica è copiata in public/sw.js (il service worker non passa da Vite).
export function cachesToDelete(names: string[], keep: string[]): string[] {
  return names.filter((n) => n.startsWith("popcorno-") && !keep.includes(n));
}
