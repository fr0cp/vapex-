/**
 * Production CORS allowlist. Merge `CORS_ORIGINS` (comma-separated) with defaults.
 * In development, callers should use `true` / reflect instead of this list.
 */
export function getProductionCorsOrigins() {
  const raw = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '';
  const fromEnv = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const defaults = ['https://vapex.app', 'https://admin.vapex.app'];
  return [...new Set([...fromEnv, ...defaults])];
}
