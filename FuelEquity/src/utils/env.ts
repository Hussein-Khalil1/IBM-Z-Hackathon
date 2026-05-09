/**
 * Type-safe environment variable accessor.
 * All public env vars are prefixed EXPO_PUBLIC_ and inlined at build time.
 */
export function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.warn(`[env] Missing env var: ${key}`);
  }
  return val ?? '';
}

export const AppEnv = (process.env.EXPO_PUBLIC_APP_ENV ?? 'dev') as 'dev' | 'prod';
export const isDev = AppEnv === 'dev';
export const isProd = AppEnv === 'prod';
