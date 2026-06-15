import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { IdentityProvisioningService } from '../src/auth/identity-provisioning.service';
import { SecurityAuthClient } from '../src/auth/security-auth.client';
import { RequestContextMiddleware } from '../src/common/middleware/request-context.middleware';

function createRequest(
  headers: Record<string, string> = {},
  options?: {
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
  },
): Request {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    ip: '127.0.0.1',
    header: jest.fn((name: string) => normalizedHeaders[name.toLowerCase()]),
    query: options?.query ?? {},
    body: options?.body ?? {},
  } as unknown as Request;
}

describe('RequestContextMiddleware', () => {
  const prisma = {
    location: {
      findFirst: jest.fn().mockResolvedValue({ id: 'location-1' }),
    },
    userRoleAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
    },
  } as any;

  it('hydrates request context with validated security identity', async () => {
    const securityAuthClient = {
      validateRequestSession: jest.fn().mockResolvedValue({
        valid: true,
        session: {
          id: 'session-1',
          expiresAt: '2026-01-01T00:00:00.000Z',
          restricted: false,
          lastSeenAt: '2026-01-01T00:00:00.000Z',
        },
        user: {
          id: 'user-1',
          email: 'owner@bakestack.demo',
          firstName: 'Bake',
          lastName: 'Stack',
          phoneNumber: null,
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
          status: 'ACTIVE',
        },
        organization: {
          id: 'org-1',
          name: 'BakeStack Demo Bakery',
          slug: 'bakestack-demo-bakery',
          status: 'ACTIVE',
          primaryEmail: 'owner@bakestack.demo',
          primaryPhone: null,
          acceptedTermsAt: null,
        },
        roles: ['OWNER'],
        memberships: [],
      }),
    } as unknown as SecurityAuthClient;
    const identityProvisioningService = {
      ensureProvisionedIdentity: jest.fn().mockResolvedValue({
        tenant: { id: 'tenant-1' },
        user: { id: 'backend-user-1' },
        onboardingProgress: { id: 'progress-1' },
      }),
    } as unknown as IdentityProvisioningService;
    const middleware = new RequestContextMiddleware(
      new ConfigService({
        DEFAULT_TENANT_HEADER: 'x-tenant-id',
        DEFAULT_LOCATION_HEADER: 'x-location-id',
      }),
      securityAuthClient,
      identityProvisioningService,
      prisma,
    );
    const request = createRequest(
      {
        'x-tenant-id': 'tenant-1',
        'x-location-id': 'location-1',
        'x-correlation-id': 'corr-1',
      },
      {
        query: { tenantId: 'other-tenant' },
        body: { tenantId: 'other-tenant' },
      },
    );
    const response = {
      setHeader: jest.fn(),
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await middleware.use(request, response, next);

    expect(request.context).toMatchObject({
      correlationId: 'corr-1',
      tenantId: 'tenant-1',
      locationId: 'location-1',
      authenticated: true,
      actorId: 'backend-user-1',
      organizationId: 'org-1',
    });
    expect(request.query).toMatchObject({
      tenantId: 'tenant-1',
    });
    expect(request.body).toMatchObject({
      tenantId: 'tenant-1',
    });
    expect(request.provisionedIdentity).toMatchObject({
      tenant: { id: 'tenant-1' },
    });
    expect(request.identity).toEqual(
      expect.objectContaining({
        valid: true,
      }),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      'corr-1',
    );
    expect(next).toHaveBeenCalled();
  });

  it('does not inject tenantId into DTO bodies that do not already declare it', async () => {
    const securityAuthClient = {
      validateRequestSession: jest.fn().mockResolvedValue({
        valid: true,
        session: null,
        user: {
          id: 'user-1',
          email: 'owner@bakestack.demo',
          firstName: 'Bake',
          lastName: 'Stack',
          phoneNumber: null,
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
          status: 'ACTIVE',
        },
        organization: {
          id: 'org-1',
          name: 'BakeStack Demo Bakery',
          slug: 'bakestack-demo-bakery',
          status: 'ACTIVE',
          primaryEmail: 'owner@bakestack.demo',
          primaryPhone: null,
          acceptedTermsAt: null,
        },
        roles: ['OWNER'],
        memberships: [],
      }),
    } as unknown as SecurityAuthClient;
    const identityProvisioningService = {
      ensureProvisionedIdentity: jest.fn().mockResolvedValue({
        tenant: { id: 'tenant-1' },
        user: { id: 'backend-user-1' },
        onboardingProgress: { id: 'progress-1' },
      }),
    } as unknown as IdentityProvisioningService;
    const middleware = new RequestContextMiddleware(
      new ConfigService({
        DEFAULT_TENANT_HEADER: 'x-tenant-id',
        DEFAULT_LOCATION_HEADER: 'x-location-id',
      }),
      securityAuthClient,
      identityProvisioningService,
      prisma,
    );
    const request = createRequest(
      {
        'x-location-id': 'location-1',
        'x-correlation-id': 'corr-2',
      },
      {
        query: {},
        body: { businessName: 'BakeStack Live' },
      },
    );
    const response = {
      setHeader: jest.fn(),
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await middleware.use(request, response, next);

    expect(request.context).toMatchObject({
      correlationId: 'corr-2',
      tenantId: 'tenant-1',
      locationId: 'location-1',
      authenticated: true,
    });
    expect(request.query).toEqual({});
    expect(request.body).toEqual({ businessName: 'BakeStack Live' });
    expect(next).toHaveBeenCalled();
  });
});
