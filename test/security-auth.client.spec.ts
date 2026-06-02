import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { DomainException } from '../src/common/exceptions/domain.exception';
import { SecurityAuthClient } from '../src/auth/security-auth.client';

function createRequest(headers: Record<string, string> = {}): Request {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    context: {
      correlationId: 'corr-1',
    },
    ip: '127.0.0.1',
    header: jest.fn((name: string) => normalizedHeaders[name.toLowerCase()]),
  } as unknown as Request;
}

function createUpstreamResponse({
  ok,
  status,
  payload,
  setCookies = [],
}: {
  ok: boolean;
  status: number;
  payload?: unknown;
  setCookies?: string[];
}): globalThis.Response {
  return {
    ok,
    status,
    headers: {
      getSetCookie: () => setCookies,
    } as unknown as Headers,
    text: jest
      .fn()
      .mockResolvedValue(payload === undefined ? '' : JSON.stringify(payload)),
  } as unknown as globalThis.Response;
}

function createClient(config: Record<string, string> = {}): SecurityAuthClient {
  return new SecurityAuthClient(
    new ConfigService({
      SECURITY_BASE_URL: 'http://localhost:4001',
      SECURITY_INTERNAL_SERVICE_API_KEY:
        'bakestake_internal_service_key_dev_2026',
      SECURITY_INTERNAL_SERVICE_NAME: 'bakestake-backend',
      SECURITY_SESSION_COOKIE_NAME: 'bk_session',
      ...config,
    }),
  );
}

describe('SecurityAuthClient', () => {
  let client: SecurityAuthClient;

  beforeEach(() => {
    client = createClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an anonymous session without calling security when no auth material exists', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    const session = await client.validateRequestSession(createRequest());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(session).toEqual({
      valid: false,
      session: null,
      user: null,
      organization: null,
      roles: [],
      memberships: [],
    });
  });

  it('forwards upstream cookies during login', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      createUpstreamResponse({
        ok: true,
        status: 200,
        payload: {
          user: {
            id: 'user-1',
          },
          session: {
            id: 'session-1',
          },
        },
        setCookies: ['bk_session=token; Path=/', 'bk_csrf=csrf; Path=/'],
      }),
    );
    const response = {
      append: jest.fn(),
      setHeader: jest.fn(),
    } as unknown as Response;

    const result = await client.login(createRequest(), response, {
      email: 'owner@bakestack.demo',
      password: 'supersafepassword',
    });

    expect(result).toEqual({
      user: {
        id: 'user-1',
      },
      session: {
        id: 'session-1',
      },
    });
    expect(response.append).toHaveBeenNthCalledWith(
      1,
      'set-cookie',
      'bk_session=token; Path=/',
    );
    expect(response.append).toHaveBeenNthCalledWith(
      2,
      'set-cookie',
      'bk_csrf=csrf; Path=/',
    );
    expect(response.setHeader).toHaveBeenCalledWith('x-csrf-token', 'csrf');
  });

  it('maps upstream unauthorized responses into domain exceptions', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      createUpstreamResponse({
        ok: false,
        status: 401,
        payload: {
          error: {
            message: 'Invalid credentials',
          },
        },
      }),
    );

    await expect(
      client.login(
        createRequest(),
        {
          append: jest.fn(),
          setHeader: jest.fn(),
        } as unknown as Response,
        {
          email: 'owner@bakestack.demo',
          password: 'wrong-password',
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DomainException>>({
        code: 'SECURITY_UNAUTHORIZED',
        message: 'Invalid credentials',
      }),
    );
  });

  it('fails closed without legacy fallback when Appwrite rejects a bearer JWT', async () => {
    client = createClient({
      APPWRITE_ENDPOINT: 'https://appwrite.example.test/v1',
      APPWRITE_PROJECT_ID: 'project-1',
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      createUpstreamResponse({
        ok: false,
        status: 401,
        payload: {
          message: 'Invalid JWT',
        },
      }),
    );

    await expect(
      client.validateRequestSession(
        createRequest({
          authorization: 'Bearer invalid-jwt',
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DomainException>>({
        code: 'SECURITY_UNAUTHORIZED',
        message: 'Invalid JWT',
        status: 401,
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(
      'https://appwrite.example.test/v1/account',
    );
  });

  it('fails closed before fallback when an Appwrite bearer token is empty', async () => {
    client = createClient({
      APPWRITE_ENDPOINT: 'https://appwrite.example.test/v1',
      APPWRITE_PROJECT_ID: 'project-1',
    });
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      client.validateRequestSession(
        createRequest({
          authorization: 'Bearer ',
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DomainException>>({
        code: 'SECURITY_UNAUTHORIZED',
        message: 'Invalid Appwrite bearer token',
        status: 401,
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed without legacy fallback when Appwrite validation is unavailable', async () => {
    client = createClient({
      APPWRITE_ENDPOINT: 'https://appwrite.example.test/v1',
      APPWRITE_PROJECT_ID: 'project-1',
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('connection refused'));

    await expect(
      client.validateRequestSession(
        createRequest({
          authorization: 'Bearer appwrite-jwt',
        }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
