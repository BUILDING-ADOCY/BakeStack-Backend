import { validateEnv } from '../src/config/env.validation';

describe('validateEnv', () => {
  const baseEnv = {
    SECURITY_BASE_URL: 'https://security.example.com',
    SECURITY_INTERNAL_SERVICE_API_KEY: 'internal-key',
  };

  it('accepts an explicit DATABASE_URL', () => {
    const validated = validateEnv({
      ...baseEnv,
      DATABASE_URL: 'postgresql://user:pass@db:5432/bakestack',
    });

    expect(validated.DATABASE_URL).toBe(
      'postgresql://user:pass@db:5432/bakestack',
    );
  });

  it('accepts Appwrite auth bridge configuration without the legacy security service', () => {
    const validated = validateEnv({
      APPWRITE_ENDPOINT: 'https://cloud.appwrite.io/v1',
      APPWRITE_PROJECT_ID: 'project_1',
      DATABASE_URL: 'postgresql://user:pass@db:5432/bakestack',
    });

    expect(validated).toEqual(
      expect.objectContaining({ APPWRITE_PROJECT_ID: 'project_1' }),
    );
  });

  it('falls back to Railway PG variables when DATABASE_URL is absent', () => {
    const validated = validateEnv({
      ...baseEnv,
      PGHOST: 'railway.internal',
      PGPORT: '5432',
      PGUSER: 'postgres',
      PGPASSWORD: 'secret',
      PGDATABASE: 'bakestack',
    });

    expect(validated.DATABASE_URL).toBe(
      'postgresql://postgres:secret@railway.internal:5432/bakestack',
    );
    expect(process.env.DATABASE_URL).toBe(validated.DATABASE_URL);
  });

  it('throws a deployment-friendly error when no database config is present', () => {
    expect(() => validateEnv(baseEnv)).toThrow(
      'Missing required database configuration. Set DATABASE_URL or provide Railway PostgreSQL variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).',
    );
  });

  it('fails closed when the security bridge key is missing and no Appwrite bridge is set', () => {
    expect(() =>
      validateEnv({
        SECURITY_BASE_URL: 'https://security.example.com',
        DATABASE_URL: 'postgresql://user:pass@db:5432/bakestack',
      }),
    ).toThrow(
      'Missing auth bridge configuration. Set APPWRITE_ENDPOINT and APPWRITE_PROJECT_ID, or provide SECURITY_BASE_URL and SECURITY_INTERNAL_SERVICE_API_KEY during legacy migration.',
    );
  });
});
