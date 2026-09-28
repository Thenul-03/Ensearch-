/**
 * Backend base URL. Override per environment with VITE_API_BASE_URL (e.g. in .env.production).
 * Remember to add the same origin to host_permissions in manifest.json.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:3000';
