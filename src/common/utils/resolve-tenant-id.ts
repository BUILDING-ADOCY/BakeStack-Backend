import type { Request } from 'express';
import { DomainException } from '../exceptions/domain.exception';

export function resolveTenantId(request: Request, fallback?: string): string {
  const tenantId = request.provisionedIdentity?.tenant.id ?? fallback;

  if (!tenantId) {
    throw new DomainException(
      'TENANT_SCOPE_REQUIRED',
      'Unable to resolve tenant scope for this request.',
      400,
    );
  }

  return tenantId;
}
