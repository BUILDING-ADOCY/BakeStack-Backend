# BakeStack Backend

Operational backend for BakeStack V1.

## Stack

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL

## Local Commands

```bash
npm install
npm run prisma:generate
npm run prisma:validate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run dev
```

## Environment

Copy `.env.example` to `.env`.

Required variables:

- `DATABASE_URL`
- `CORS_ORIGINS`
- `SECURITY_BASE_URL`
- `SECURITY_INTERNAL_SERVICE_API_KEY`
- `PORT`
- `HOST`

## Runtime Notes

- `/health` is the liveness endpoint.
- `/health/ready` performs database and security-service readiness checks.
- Auth/session flows are proxied to `OUTREACH SECURITY`.
- Authenticated requests derive tenant scope from the security session; client-supplied `tenantId` is not trusted as the source of truth.
- The live Netlify frontend origin is `https://bakestack.netlify.app`; use that exact value in `CORS_ORIGINS` unless you move the frontend to a different domain.
- Railway deployment setup is documented in [RAILWAY_ENV_SETUP.md](/Users/surajmahapatra/Documents/PROJECT%20BAKESTACK%202/BAKESTACK%20BACKEND/RAILWAY_ENV_SETUP.md).

## Railway Production Notes

- Attach a PostgreSQL service to the backend service, or set `DATABASE_URL` manually.
- Railway can inject `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`; the backend now derives `DATABASE_URL` from those if needed.
- If you use a separate security deployment, set `SECURITY_BASE_URL` to the private or public URL that the backend can actually reach.
- Make sure the backend service is redeployed after the database variables are linked or rotated.

## PostgreSQL RLS Rollout

- Migration `20260601130000_tenant_location_rls` creates the non-bypass `bakestack_runtime` role and tenant/location policies.
- `ScopedPrismaService.withScope()` sets transaction-local tenant, actor, allowed-location, and tenant-wide access values.
- Keep migration and seed jobs on the owning database credential.
- Do not switch application traffic to the runtime credential until every operational request path runs inside `ScopedPrismaService.withScope()`. The policy layer is fail-closed, so an early credential switch will correctly deny unscoped reads and writes.
