import type { ReactNode } from "react";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

const jsonLd = {"@context":"https://schema.org","@type":"WebApplication","name":"Popcorno","url":"https://popcorno.it/","inLanguage":"it","applicationCategory":"EntertainmentApplication","operatingSystem":"Web","description":"Ti suggerisce cosa guardare stasera: film, serie e sport in TV, in streaming e al cinema in Italia.","offers":{"@type":"Offer","price":"0","priceCurrency":"EUR"}};

const fontFace = `
@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-weight:200 800;font-display:swap;src:url(/fonts/bricolage.woff2) format("woff2-variations"),url(/fonts/bricolage.woff2) format("woff2")}
@font-face{font-family:Figtree;font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/figtree-400.woff2) format("woff2")}
@font-face{font-family:Figtree;font-style:normal;font-weight:500;font-display:swap;src:url(/fonts/figtree-500.woff2) format("woff2")}
@font-face{font-family:Figtree;font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/figtree-600.woff2) format("woff2")}
@font-face{font-family:Figtree;font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/figtree-700.woff2) format("woff2")}
@font-face{font-family:VT323;font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/vt323.woff2) format("woff2")}
`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#151a44" },
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
      { rel: "icon", type: "image/png", href: "/icons/icon-180.png" },
      { rel: "apple-touch-icon", href: "/icons/icon-180.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://image.tmdb.org" },
      { rel: "canonical", href: "https://popcorno.it/" },
      { rel: "preload", href: "/fonts/figtree-400.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ],
    styles: [{ children: fontFace }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
