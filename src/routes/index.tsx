import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppStateProvider } from "../app-state";
import { Shell } from "../components/Shell";
// Tutto il CSS dell'app vecchia, @font-face compresi.
import appCss from "../styles/app.css?url";

const jsonLd = {"@context":"https://schema.org","@type":"WebApplication","name":"Popcorno","url":"https://popcorno.it/","inLanguage":"it","applicationCategory":"EntertainmentApplication","operatingSystem":"Web","description":"Ti suggerisce cosa guardare stasera: film, serie e sport in TV, in streaming e al cinema in Italia.","offers":{"@type":"Offer","price":"0","priceCurrency":"EUR"}};

// Come oggi: il service worker si registra solo dalla pagina dell'app, dopo il caricamento nel browser.
function App() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      try { navigator.serviceWorker.register("/sw.js").catch(() => {}); } catch { /* come oggi: si ignora */ }
    }
  }, []);
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Popcorno" },
      { title: "Popcorno – cosa guardo stasera?" },
      {
        name: "description",
        content:
          "Popcorno ti dice cosa guardare stasera: film, serie e sport in TV (Rai, Mediaset, Sky, DAZN, Pluto TV), su Netflix, Prime Video, Disney+ e al cinema nella tua città. Gratis, senza registrazione.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Popcorno" },
      { property: "og:locale", content: "it_IT" },
      { property: "og:url", content: "https://popcorno.it/" },
      { property: "og:title", content: "Popcorno – cosa guardo stasera?" },
      {
        property: "og:description",
        content: "Film, serie e sport di stasera in TV, in streaming e al cinema, scelti per te in pochi tocchi.",
      },
      { property: "og:image", content: "https://popcorno.it/icons/icon-512.png" },
      { name: "twitter:card", content: "summary" },
      { "script:ld+json": jsonLd },
    ],
    links: [
      { rel: "apple-touch-icon", href: "/icons/icon-180.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://image.tmdb.org" },
      { rel: "canonical", href: "https://popcorno.it/" },
      { rel: "preload", href: "/fonts/figtree-400.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: App,
});
