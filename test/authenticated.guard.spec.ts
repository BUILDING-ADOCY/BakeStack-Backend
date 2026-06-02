import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../src/auth/authenticated.guard';
import type { SecuritySessionValidationResponse } from '../src/auth/auth.types';
import { Public } from '../src/auth/public.decorator';
import { DomainException } from '../src/common/exceptions/domain.exception';

class ProtectedController {
  handler() {}
}

@Public()
class PublicController {
  handler() {}
}

class ControllerWithPublicHandler {
  @Public()
  handler() {}
}

function createContext(
  identity?: SecuritySessionValidationResponse,
  controller: new () => object = ProtectedController,
) {
  const request = {
    identity,
  } as unknown as Request;

  return {
    getClass: () => controller,
    getHandler: () => controller.prototype.handler,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function createIdentity(): SecuritySessionValidationResponse {
  return {
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
    roles: ['merchant_owner'],
    memberships: [],
  };
}

describe('AuthenticatedGuard', () => {
  const guard = new AuthenticatedGuard(new Reflector());

  it('allows a hydrated authenticated identity', () => {
    expect(guard.canActivate(createContext(createIdentity()))).toBe(true);
  });

  it('allows a controller marked as public without a hydrated identity', () => {
    expect(guard.canActivate(createContext(undefined, PublicController))).toBe(
      true,
    );
  });

  it('allows a handler marked as public without a hydrated identity', () => {
    expect(
      guard.canActivate(createContext(undefined, ControllerWithPublicHandler)),
    ).toBe(true);
  });

  it('rejects a request without a hydrated identity', () => {
    expect(() => guard.canActivate(createContext())).toThrow(
      expect.objectContaining<Partial<DomainException>>({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'An authenticated session is required.',
        status: 401,
      }),
    );
  });

  it('rejects an incomplete authenticated identity', () => {
    expect(() =>
      guard.canActivate(
        createContext({
          ...createIdentity(),
          organization: null,
        }),
      ),
    ).toThrow(
      expect.objectContaining<Partial<DomainException>>({
        code: 'AUTHENTICATION_REQUIRED',
        status: 401,
      }),
    );
  });
});
