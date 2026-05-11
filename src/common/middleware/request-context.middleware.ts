import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { IdentityProvisioningService } from '../../auth/identity-provisioning.service';
import { SecurityAuthClient } from '../../auth/security-auth.client';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestContextMiddleware.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly securityAuthClient: SecurityAuthClient,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  async use(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const tenantHeader =
      this.configService.get<string>('DEFAULT_TENANT_HEADER') ?? 'x-tenant-id';
    const locationHeader =
      this.configService.get<string>('DEFAULT_LOCATION_HEADER') ??
      'x-location-id';
    const correlationId = request.header('x-correlation-id') ?? randomUUID();

    request.context = {
      correlationId,
      tenantId: request.header(tenantHeader) ?? undefined,
      locationId: request.header(locationHeader) ?? undefined,
      idempotencyKey: request.header('Idempotency-Key') ?? undefined,
    };

    try {
      const identity =
        await this.securityAuthClient.validateRequestSession(request);
      request.identity = identity;
      request.context.authenticated = identity.valid;
      request.context.actorId = identity.user?.id ?? undefined;
      request.context.organizationId = identity.organization?.id ?? undefined;

      if (identity.valid && identity.user && identity.organization) {
        const provisioned =
          await this.identityProvisioningService.ensureProvisionedIdentity(
            identity,
          );
        request.provisionedIdentity = provisioned;
        request.context.tenantId = provisioned.tenant.id;
        this.syncTenantScope(request, provisioned.tenant.id);
      }
    } catch (error) {
      this.logger.warn(
        `Skipping security session hydration for correlationId=${correlationId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      request.context.authenticated = false;
    }

    response.setHeader('x-correlation-id', correlationId);
    next();
  }

  private syncTenantScope(request: Request, tenantId: string): void {
    const queryRecord = this.asMutableRecord(request.query);
    if (queryRecord) {
      if (Object.prototype.hasOwnProperty.call(queryRecord, 'tenantId')) {
        if (
          typeof queryRecord.tenantId === 'string' &&
          queryRecord.tenantId !== tenantId
        ) {
          this.logger.warn(
            `Overriding mismatched tenantId query parameter for correlationId=${request.context?.correlationId ?? 'n/a'}`,
          );
        }
        queryRecord.tenantId = tenantId;
      }
    }

    const bodyRecord = this.asMutableRecord(request.body);
    if (bodyRecord) {
      if (Object.prototype.hasOwnProperty.call(bodyRecord, 'tenantId')) {
        if (
          typeof bodyRecord.tenantId === 'string' &&
          bodyRecord.tenantId !== tenantId
        ) {
          this.logger.warn(
            `Overriding mismatched tenantId body field for correlationId=${request.context?.correlationId ?? 'n/a'}`,
          );
        }
        bodyRecord.tenantId = tenantId;
      }
    }
  }

  private asMutableRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }
}
