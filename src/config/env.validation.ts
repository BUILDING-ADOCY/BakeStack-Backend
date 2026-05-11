type BackendEnv = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  'DATABASE_URL',
  'SECURITY_BASE_URL',
  'SECURITY_INTERNAL_SERVICE_API_KEY',
];

const assertNonEmpty = (env: BackendEnv, key: string) => {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const assertNumber = (
  env: BackendEnv,
  key: string,
  fallback: string,
): number => {
  const raw = env[key]?.trim() || fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${key} must be a positive number`);
  }

  return parsed;
};

export const validateEnv = (rawEnv: BackendEnv) => {
  for (const key of REQUIRED_KEYS) {
    assertNonEmpty(rawEnv, key);
  }

  const port = assertNumber(rawEnv, 'PORT', '3010');
  const nodeEnv = rawEnv.NODE_ENV?.trim() || 'development';

  return {
    ...rawEnv,
    NODE_ENV: nodeEnv,
    PORT: String(port),
    HOST: rawEnv.HOST?.trim() || '0.0.0.0',
    CORS_ORIGINS:
      rawEnv.CORS_ORIGINS?.trim() ||
      'http://localhost:5176,http://127.0.0.1:5176',
    DEFAULT_TENANT_HEADER:
      rawEnv.DEFAULT_TENANT_HEADER?.trim() || 'x-tenant-id',
    DEFAULT_LOCATION_HEADER:
      rawEnv.DEFAULT_LOCATION_HEADER?.trim() || 'x-location-id',
    SECURITY_INTERNAL_SERVICE_NAME:
      rawEnv.SECURITY_INTERNAL_SERVICE_NAME?.trim() || 'bakestake-backend',
    SECURITY_SESSION_COOKIE_NAME:
      rawEnv.SECURITY_SESSION_COOKIE_NAME?.trim() || 'bk_session',
  };
};
