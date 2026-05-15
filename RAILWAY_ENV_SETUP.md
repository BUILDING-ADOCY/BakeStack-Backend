# Railway Environment Setup

This document covers the BakeStack production deployment variables for:

- `BAKESTACK BACKEND`
- `OUTREACH SECURITY`

The backend crash you saw on Railway came from:

- [src/config/env.validation.ts](/Users/surajmahapatra/Documents/PROJECT%20BAKESTACK%202/BAKESTACK%20BACKEND/src/config/env.validation.ts)

The security-service crash you pasted later came from:

- [packages/config/src/index.ts](/Users/surajmahapatra/Documents/PROJECT%20BAKESTACK%202/OUTREACH%20SECURITY%20/packages/config/src/index.ts)

## 1. BakeStack Backend Variables

### Required

- `DATABASE_URL`
  or one of:
  `DATABASE_PRIVATE_URL`, `DATABASE_PUBLIC_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`
  or all of:
  `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- `SECURITY_BASE_URL`
- `SECURITY_INTERNAL_SERVICE_API_KEY`

### Optional / defaulted in code

- `NODE_ENV` default: `development`
- `PORT` default: `3010`
- `HOST` default: `0.0.0.0`
- `CORS_ORIGINS` default: `http://localhost:5176,http://127.0.0.1:5176`
- `DEFAULT_TENANT_HEADER` default: `x-tenant-id`
- `DEFAULT_LOCATION_HEADER` default: `x-location-id`
- `SECURITY_INTERNAL_SERVICE_NAME` default: `bakestake-backend`
- `SECURITY_SESSION_COOKIE_NAME` default: `bk_session`
- `PGSSLMODE` optional when using `PG*` fallback assembly

### Railway dashboard steps

1. Open the `BakeStack-Backend` service in Railway.
2. Open the `Variables` tab.
3. Attach a PostgreSQL service to the project if not already attached.
4. Add `DATABASE_URL` as a reference variable from the Railway Postgres service.
5. Add `SECURITY_BASE_URL` pointing to the deployed security service.
6. Add `SECURITY_INTERNAL_SERVICE_API_KEY` and make sure the same value exists in the security service as `INTERNAL_SERVICE_API_KEY`.
7. Add `CORS_ORIGINS` with your production UI URL.
8. Redeploy the service.

### Railway CLI commands

Replace `Postgres` below if your Railway PostgreSQL service has a different name.

```bash
railway variables set DATABASE_URL='${{Postgres.DATABASE_URL}}' --service BakeStack-Backend --environment production
railway variables set NODE_ENV='production' --service BakeStack-Backend --environment production
railway variables set PORT='3010' --service BakeStack-Backend --environment production
railway variables set HOST='0.0.0.0' --service BakeStack-Backend --environment production
railway variables set CORS_ORIGINS='https://your-frontend-domain.com' --service BakeStack-Backend --environment production
railway variables set SECURITY_BASE_URL='https://your-security-service.up.railway.app' --service BakeStack-Backend --environment production
railway variables set SECURITY_INTERNAL_SERVICE_API_KEY='CHANGE_ME_SHARED_INTERNAL_API_KEY' --service BakeStack-Backend --environment production
railway variables set SECURITY_INTERNAL_SERVICE_NAME='bakestake-backend' --service BakeStack-Backend --environment production
railway variables set SECURITY_SESSION_COOKIE_NAME='bk_session' --service BakeStack-Backend --environment production
```

### Prisma / build notes

Backend Prisma schema:

- [prisma/schema.prisma](/Users/surajmahapatra/Documents/PROJECT%20BAKESTACK%202/BAKESTACK%20BACKEND/prisma/schema.prisma)

It uses:

```prisma
url = env("DATABASE_URL")
```

Recommended Railway build command:

```bash
npm install && npx prisma generate && npx prisma migrate deploy && npm run build
```

Recommended Railway start command:

```bash
npm run start:prod
```

## 2. Outreach Security Variables

These are required if you are deploying the paired `OUTREACH SECURITY` service to Railway.

### Required

- `APP_URL`
- `WEB_APP_URL`
- `ADMIN_APP_URL`
- `CORS_ORIGINS`
- `COOKIE_DOMAIN`
- `DATABASE_URL`
- `REDIS_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_SMS_FROM`
- `JWT_SERVICE_SECRET`
- `WEBHOOK_SIGNING_SECRET`
- `INTERNAL_SERVICE_API_KEY`

### Optional / defaulted in code

- `NODE_ENV` default: `development`
- `PORT` default: `3000`
- `APP_NAME` default: `Bakestake Security API`
- `COOKIE_SECURE` default: `false`
- `COOKIE_SAME_SITE` default: `lax`
- `CSRF_COOKIE_NAME` default: `bk_csrf`
- `SESSION_COOKIE_NAME` default: `bk_session`
- `SESSION_TTL_HOURS` default: `168`
- `RESTRICT_UNVERIFIED_LOGIN` default: `true`
- `PASSWORD_RESET_TTL_MINUTES` default: `15`
- `EMAIL_VERIFICATION_TTL_HOURS` default: `24`
- `INVITE_TTL_HOURS` default: `72`
- `STEP_UP_TTL_MINUTES` default: `10`
- `SESSION_REVOKE_ON_PASSWORD_RESET` default: `true`
- `FIREBASE_PROJECT_ID` optional
- `FIREBASE_SERVICE_ACCOUNT_PATH` optional
- `INTERNAL_ALLOWED_SERVICES` default: `bakestake-backend`
- `AUDIT_RETENTION_DAYS` default: `365`
- `RATE_LIMIT_SIGNUP_MAX` default: `10`
- `RATE_LIMIT_LOGIN_MAX` default: `10`
- `RATE_LIMIT_PASSWORD_RESET_MAX` default: `8`
- `RATE_LIMIT_VERIFY_MAX` default: `12`
- `RATE_LIMIT_INVITE_MAX` default: `20`
- `RATE_LIMIT_WINDOW_SECONDS` default: `900`
- `LOGIN_BACKOFF_BASE_SECONDS` default: `30`
- `LOGIN_BACKOFF_MAX_SECONDS` default: `1800`
- `OTEL_SERVICE_NAME` default: `bakestake-security-api`

### Railway dashboard steps

1. Open the `BakeStack-Security` service in Railway.
2. Open `Variables`.
3. Attach PostgreSQL and Redis services to the same project.
4. Add `DATABASE_URL` from PostgreSQL and `REDIS_URL` from Redis.
5. Add all messaging and secret variables listed above.
6. Set `INTERNAL_SERVICE_API_KEY` to the same shared value used by the backend as `SECURITY_INTERNAL_SERVICE_API_KEY`.
7. Set `APP_URL`, `WEB_APP_URL`, `ADMIN_APP_URL`, and `CORS_ORIGINS` to your real production domains.
8. Redeploy the service.

### Railway CLI commands

Replace `Postgres` and `Redis` below if your Railway services use different names.

```bash
railway variables set DATABASE_URL='${{Postgres.DATABASE_URL}}' --service BakeStack-Security --environment production
railway variables set REDIS_URL='${{Redis.REDIS_URL}}' --service BakeStack-Security --environment production
railway variables set NODE_ENV='production' --service BakeStack-Security --environment production
railway variables set PORT='4001' --service BakeStack-Security --environment production
railway variables set APP_URL='https://your-security-service.up.railway.app' --service BakeStack-Security --environment production
railway variables set WEB_APP_URL='https://your-frontend-domain.com' --service BakeStack-Security --environment production
railway variables set ADMIN_APP_URL='https://your-frontend-domain.com' --service BakeStack-Security --environment production
railway variables set CORS_ORIGINS='https://your-frontend-domain.com' --service BakeStack-Security --environment production
railway variables set COOKIE_DOMAIN='your-frontend-domain.com' --service BakeStack-Security --environment production
railway variables set COOKIE_SECURE='true' --service BakeStack-Security --environment production
railway variables set COOKIE_SAME_SITE='none' --service BakeStack-Security --environment production
railway variables set RESEND_API_KEY='CHANGE_ME_RESEND_KEY' --service BakeStack-Security --environment production
railway variables set RESEND_FROM_EMAIL='no-reply@your-domain.com' --service BakeStack-Security --environment production
railway variables set TWILIO_ACCOUNT_SID='CHANGE_ME_TWILIO_SID' --service BakeStack-Security --environment production
railway variables set TWILIO_AUTH_TOKEN='CHANGE_ME_TWILIO_TOKEN' --service BakeStack-Security --environment production
railway variables set TWILIO_VERIFY_SERVICE_SID='CHANGE_ME_VERIFY_SERVICE_SID' --service BakeStack-Security --environment production
railway variables set TWILIO_WHATSAPP_FROM='whatsapp:+14155238886' --service BakeStack-Security --environment production
railway variables set TWILIO_SMS_FROM='+15555555555' --service BakeStack-Security --environment production
railway variables set JWT_SERVICE_SECRET='CHANGE_ME_STRONG_SECRET_MIN_32' --service BakeStack-Security --environment production
railway variables set WEBHOOK_SIGNING_SECRET='CHANGE_ME_WEBHOOK_SECRET_MIN_16' --service BakeStack-Security --environment production
railway variables set INTERNAL_SERVICE_API_KEY='CHANGE_ME_SHARED_INTERNAL_API_KEY' --service BakeStack-Security --environment production
railway variables set INTERNAL_ALLOWED_SERVICES='bakestake-backend' --service BakeStack-Security --environment production
```

## 3. Redeploy commands

Backend redeploy:

```bash
railway up --service BakeStack-Backend --environment production
```

Security redeploy:

```bash
railway up --service BakeStack-Security --environment production
```

## 4. Health checks

Backend health endpoints already exist:

- `GET /health`
- `GET /health/ready`

The backend listens on Railway `PORT` and binds to `0.0.0.0` in:

- [src/main.ts](/Users/surajmahapatra/Documents/PROJECT%20BAKESTACK%202/BAKESTACK%20BACKEND/src/main.ts)
