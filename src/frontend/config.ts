// API endpoint for the visit-history backend (Cloudflare Workers).
// Override at build time via `process.env.API_BASE_URL` for production deploys.
const PRODUCTION_DEFAULT = 'http://localhost:8787';
const DEVELOPMENT_DEFAULT = 'http://localhost:8787';

export const API_BASE_URL: string =
    process.env.API_BASE_URL ??
    (process.env.NODE_ENV === 'production' ? PRODUCTION_DEFAULT : DEVELOPMENT_DEFAULT);
