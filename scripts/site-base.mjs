// The public path the whole site is served from. GitHub Pages serves this repo at
// kalebdida.github.io/delivered/, so every app's base starts with /delivered/.
// Override with SITE_BASE=/ to serve the site from a domain root (Netlify, a custom domain).
export const SITE_BASE = `/${(process.env.SITE_BASE ?? '/delivered/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
