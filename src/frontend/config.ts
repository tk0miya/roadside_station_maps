// API endpoint for the visit-history backend (Cloudflare Workers).
//
// Selected at runtime by hostname so a single bundle works on both
// `wrangler dev` (localhost) and the GitHub Pages deployment. The URLs are
// not secret -- the bundle is committed and served publicly anyway -- so
// they can live in source. Update PRODUCTION_API after running
// `wrangler deploy` to point at the actual *.workers.dev (or custom)
// hostname for this Worker.
const PRODUCTION_API = 'https://roadside-station-maps-api-production.i-tkomiya.workers.dev';
const DEVELOPMENT_API = 'http://localhost:8787';

const isDevelopmentHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE_URL: string = isDevelopmentHost ? DEVELOPMENT_API : PRODUCTION_API;
