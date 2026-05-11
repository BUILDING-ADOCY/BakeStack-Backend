export interface RequestContext {
  correlationId: string;
  tenantId?: string;
  locationId?: string;
  idempotencyKey?: string;
  authenticated?: boolean;
  actorId?: string;
  organizationId?: string;
}
