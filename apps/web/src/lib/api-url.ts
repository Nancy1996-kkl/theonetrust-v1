import { API_V1_PREFIX } from '@theonetrust/contracts';

/**
 * Full URL for an API v1 path. Accepts VITE_API_BASE_URL with or without the `/api/v1` suffix
 * (`.env.example` uses `http://localhost:4000/api/v1`), and '' for a same-origin API.
 */
export function apiUrl(base: string | undefined, path: string): string {
  const origin = (base ?? '').replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  return `${origin}${API_V1_PREFIX}${path}`;
}
