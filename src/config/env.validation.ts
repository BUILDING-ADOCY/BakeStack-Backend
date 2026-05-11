type BackendEnv = Record<string, string | undefined>;

const REQUIRED_KEYS = [
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

const trimOptional = (value?: string) => value?.trim() || undefined;

const resolveDatabaseUrl = (env: BackendEnv) => {
  const explicitUrl =
    trimOptional(env.DATABASE_URL) ||
    trimOptional(env.DATABASE_PRIVATE_URL) ||
    trimOptional(env.DATABASE_PUBLIC_URL) ||
    trimOptional(env.POSTGRES_URL) ||
    trimOptional(env.POSTGRES_PRISMA_URL) ||
    trimOptional(env.POSTGRES_URL_NON_POOLING);

  if (explicitUrl) {
    return explicitUrl;
  }

  const host = trimOptional(env.PGHOST);
  const port = trimOptional(env.PGPORT);
  const user = trimOptional(env.PGUSER);
  const password = trimOptional(env.PGPASSWORD);
  const database = trimOptional(env.PGDATABASE);

  if (host && port && user && password && database) {
    const params = new URLSearchParams();
    const sslMode = trimOptional(env.PGSSLMODE);

    if (sslMode) {
      params.set('sslmode', sslMode);
    }

    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}${params.size ? `?${params.toString()}` : ''}`;
  }

  throw new Error(
    'Missing required database configuration. Set DATABASE_URL or provide Railway PostgreSQL variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).',
  );
};

export const validateEnv = (rawEnv: BackendEnv) => {
  const databaseUrl = resolveDatabaseUrl(rawEnv);

  for (const key of REQUIRED_KEYS) {
    assertNonEmpty(rawEnv, key);
  }

  const port = assertNumber(rawEnv, 'PORT', '3010');
  const nodeEnv = rawEnv.NODE_ENV?.trim() || 'development';

  rawEnv.DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL = databaseUrl;

  return {
    ...rawEnv,
    DATABASE_URL: databaseUrl,
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
