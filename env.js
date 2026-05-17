const DEV_JWT_FALLBACK = 'vapex-dev-secret';

export function assertProductionEnv() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('[vapex] FATAL: JWT_SECRET is required when NODE_ENV=production');
    process.exit(1);
  }
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return DEV_JWT_FALLBACK;
}
