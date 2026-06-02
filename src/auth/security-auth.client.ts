import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { DomainException } from '../common/exceptions/domain.exception';
import type {
  SecurityAuthResult,
  SecuritySessionValidationResponse,
} from './auth.types';

type UpstreamResponse<T> = {
  data: T;
  status: number;
};

const SESSION_TOKEN_HEADER = 'x-session-token';
const CSRF_HEADER = 'x-csrf-token';
const CORRELATION_ID_HEADER = 'x-correlation-id';
const INTERNAL_SERVICE_KEY_HEADER = 'x-internal-service-key';
const INTERNAL_SERVICE_NAME_HEADER = 'x-internal-service-name';
const CSRF_COOKIE_NAME = 'bk_csrf';

@Injectable()
export class SecurityAuthClient {
  private readonly logger = new Logger(SecurityAuthClient.name);

  constructor(private readonly configService: ConfigService) {}

  async signup(
    request: Request,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return (
      await this.send<Record<string, unknown>>({
        method: 'POST',
        path: '/auth/signup',
        request,
        body: payload,
      })
    ).data;
  }

  async register(
    request: Request,
    response: Response,
    payload: unknown,
  ): Promise<SecurityAuthResult> {
    return (
      await this.send<SecurityAuthResult>({
        method: 'POST',
        path: '/auth/register',
        request,
        response,
        body: payload,
      })
    ).data;
  }

  async login(
    request: Request,
    response: Response,
    payload: unknown,
  ): Promise<SecurityAuthResult> {
    return (
      await this.send<SecurityAuthResult>({
        method: 'POST',
        path: '/auth/login',
        request,
        response,
        body: payload,
      })
    ).data;
  }

  async loginWithFirebase(
    request: Request,
    response: Response,
    payload: unknown,
  ): Promise<SecurityAuthResult> {
    return (
      await this.send<SecurityAuthResult>({
        method: 'POST',
        path: '/auth/oauth/firebase',
        request,
        response,
        body: payload,
      })
    ).data;
  }

  async logout(request: Request, response: Response): Promise<void> {
    await this.send({
      method: 'POST',
      path: '/auth/logout',
      request,
      response,
    });
  }

  async logoutAll(request: Request, response: Response): Promise<void> {
    await this.send({
      method: 'POST',
      path: '/auth/logout-all',
      request,
      response,
    });
  }

  async requestEmailVerification(
    request: Request,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return (
      await this.send<Record<string, unknown>>({
        method: 'POST',
        path: '/auth/verify-email/request',
        request,
        body: payload,
      })
    ).data;
  }

  async confirmEmailVerification(
    request: Request,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return (
      await this.send<Record<string, unknown>>({
        method: 'POST',
        path: '/auth/verify-email/confirm',
        request,
        body: payload,
      })
    ).data;
  }

  async forgotPassword(
    request: Request,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return (
      await this.send<Record<string, unknown>>({
        method: 'POST',
        path: '/auth/password/forgot',
        request,
        body: payload,
      })
    ).data;
  }

  async resetPassword(
    request: Request,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return (
      await this.send<Record<string, unknown>>({
        method: 'POST',
        path: '/auth/password/reset',
        request,
        body: payload,
      })
    ).data;
  }

  async startStepUp(
    request: Request,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return (
      await this.send<Record<string, unknown>>({
        method: 'POST',
        path: '/auth/step-up/start',
        request,
        body: payload,
      })
    ).data;
  }

  async verifyStepUp(
    request: Request,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return (
      await this.send<Record<string, unknown>>({
        method: 'POST',
        path: '/auth/step-up/verify',
        request,
        body: payload,
      })
    ).data;
  }

  async validateRequestSession(
    request: Request,
  ): Promise<SecuritySessionValidationResponse> {
    const appwriteSession = await this.validateAppwriteJwt(request);
    if (appwriteSession) {
      return appwriteSession;
    }

    if (!this.hasSessionMaterial(request)) {
      return this.buildAnonymousSession();
    }

    return (
      await this.send<SecuritySessionValidationResponse>({
        method: 'GET',
        path: '/auth/session/validate',
        request,
        internal: true,
      })
    ).data;
  }

  private async send<T>({
    method,
    path,
    request,
    response,
    body,
    internal = false,
  }: {
    method: 'GET' | 'POST';
    path: string;
    request: Request;
    response?: Response;
    body?: unknown;
    internal?: boolean;
  }): Promise<UpstreamResponse<T>> {
    const url = new URL(path, this.getSecurityBaseUrl());
    const headers = new Headers();

    headers.set('accept', 'application/json');
    headers.set(
      CORRELATION_ID_HEADER,
      request.context?.correlationId ??
        request.header(CORRELATION_ID_HEADER) ??
        '',
    );

    this.forwardHeader(request, headers, 'authorization');
    this.forwardHeader(request, headers, 'cookie');
    this.forwardHeader(request, headers, SESSION_TOKEN_HEADER);
    this.forwardHeader(request, headers, CSRF_HEADER);
    this.forwardHeader(request, headers, 'user-agent');

    const forwardedFor = request.header('x-forwarded-for') ?? request.ip;
    if (forwardedFor) {
      headers.set('x-forwarded-for', forwardedFor);
    }

    if (internal) {
      headers.set(
        INTERNAL_SERVICE_KEY_HEADER,
        this.configService.getOrThrow<string>(
          'SECURITY_INTERNAL_SERVICE_API_KEY',
        ),
      );
      headers.set(
        INTERNAL_SERVICE_NAME_HEADER,
        this.configService.get<string>(
          'SECURITY_INTERNAL_SERVICE_NAME',
          'bakestake-backend',
        ),
      );
    }

    if (body !== undefined) {
      headers.set('content-type', 'application/json');
    }

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      this.logger.error(
        `Security request failed for ${method} ${path}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException(
        'Security service is currently unavailable',
      );
    }

    this.forwardSetCookies(upstream, response);

    const payload = await this.readPayload(upstream);
    if (!upstream.ok) {
      throw this.buildUpstreamException(upstream.status, payload);
    }

    return {
      data: payload as T,
      status: upstream.status,
    };
  }

  private async readPayload(
    upstream: globalThis.Response,
  ): Promise<unknown | undefined> {
    if (upstream.status === 204) {
      return undefined;
    }

    const text = await upstream.text();
    if (!text) {
      return undefined;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      this.logger.warn(
        `Unable to parse security response body: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return {
        message: text,
      };
    }
  }

  private buildUpstreamException(
    status: number,
    payload: unknown,
  ): DomainException {
    const message = this.extractMessage(payload);

    if (status === 401) {
      return new DomainException(
        'SECURITY_UNAUTHORIZED',
        message,
        status,
        payload,
      );
    }

    if (status === 403) {
      return new DomainException(
        'SECURITY_FORBIDDEN',
        message,
        status,
        payload,
      );
    }

    if (status === 400) {
      return new DomainException(
        'SECURITY_BAD_REQUEST',
        message,
        status,
        payload,
      );
    }

    return new DomainException(
      'SECURITY_SERVICE_ERROR',
      message,
      status,
      payload,
    );
  }

  private extractMessage(payload: unknown): string {
    if (!payload) {
      return 'Security service request failed';
    }

    if (typeof payload === 'string') {
      return payload;
    }

    if (typeof payload !== 'object') {
      return 'Security service request failed';
    }

    const typedPayload = payload as {
      message?: unknown;
      error?: unknown;
    };

    if (Array.isArray(typedPayload.message)) {
      return typedPayload.message.join(', ');
    }

    if (typeof typedPayload.message === 'string') {
      return typedPayload.message;
    }

    if (typedPayload.error) {
      return this.extractMessage(typedPayload.error);
    }

    return 'Security service request failed';
  }

  private forwardHeader(
    request: Request,
    headers: Headers,
    headerName: string,
  ): void {
    const value = request.header(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  private forwardSetCookies(
    upstream: globalThis.Response,
    response?: Response,
  ): void {
    if (!response) {
      return;
    }

    const upstreamHeaders = upstream.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const setCookies =
      typeof upstreamHeaders.getSetCookie === 'function'
        ? upstreamHeaders.getSetCookie()
        : [];

    for (const cookie of setCookies) {
      response.append('set-cookie', cookie);

      const csrfToken = this.extractCookieValue(cookie, CSRF_COOKIE_NAME);
      if (csrfToken) {
        response.setHeader(CSRF_HEADER, csrfToken);
      }
    }
  }

  private extractCookieValue(
    cookieHeader: string,
    cookieName: string,
  ): string | undefined {
    const [firstSegment] = cookieHeader.split(';');
    if (!firstSegment) {
      return undefined;
    }

    const [name, ...valueParts] = firstSegment.split('=');
    if (name?.trim() !== cookieName) {
      return undefined;
    }

    const rawValue = valueParts.join('=').trim();
    return rawValue ? decodeURIComponent(rawValue) : undefined;
  }

  private hasSessionMaterial(request: Request): boolean {
    const cookieHeader = request.header('cookie');
    const sessionCookieName = this.configService.get<string>(
      'SECURITY_SESSION_COOKIE_NAME',
      'bk_session',
    );

    return Boolean(
      request.header(SESSION_TOKEN_HEADER) ||
      request.header('authorization') ||
      (cookieHeader && cookieHeader.includes(`${sessionCookieName}=`)),
    );
  }

  private buildAnonymousSession(): SecuritySessionValidationResponse {
    return {
      valid: false,
      session: null,
      user: null,
      organization: null,
      roles: [],
      memberships: [],
    };
  }

  private getSecurityBaseUrl(): string {
    const configuredBaseUrl = this.configService.get<string>(
      'SECURITY_BASE_URL',
      'http://localhost:4001',
    );

    return configuredBaseUrl.endsWith('/')
      ? configuredBaseUrl
      : `${configuredBaseUrl}/`;
  }

  private async validateAppwriteJwt(
    request: Request,
  ): Promise<SecuritySessionValidationResponse | null> {
    const jwt = this.extractBearerToken(request);
    const authorization = request.header('authorization')?.trim();
    const endpoint = this.configService
      .get<string>('APPWRITE_ENDPOINT')
      ?.trim();
    const projectId = this.configService
      .get<string>('APPWRITE_PROJECT_ID')
      ?.trim();

    if (!endpoint || !projectId || !this.isBearerAuthorization(authorization)) {
      return null;
    }

    if (!jwt) {
      throw new DomainException(
        'SECURITY_UNAUTHORIZED',
        'Invalid Appwrite bearer token',
        401,
      );
    }

    try {
      const user = await this.appwriteRequest<{
        $id: string;
        name?: string;
        email: string;
        phone?: string;
        status: boolean;
        emailVerification?: boolean;
        phoneVerification?: boolean;
        $updatedAt?: string;
      }>({
        endpoint,
        projectId,
        jwt,
        path: '/account',
      });
      const teams = await this.appwriteRequest<{
        teams: Array<{
          $id: string;
          name: string;
        }>;
      }>({
        endpoint,
        projectId,
        jwt,
        path: '/teams',
      });
      const team = teams.teams[0] ?? null;
      const membership = team
        ? await this.findAppwriteMembership({
            endpoint,
            projectId,
            jwt,
            teamId: team.$id,
            userId: user.$id,
          })
        : null;
      const roles = this.mapAppwriteRoles(membership?.roles ?? ['owner']);
      const displayName = user.name?.trim() || user.email.split('@')[0] || '';
      const [firstName, ...lastNameParts] = displayName.split(/\s+/);
      const now = new Date();

      return {
        valid: Boolean(team),
        session: team
          ? {
              id: `appwrite:${user.$id}`,
              expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
              restricted: false,
              lastSeenAt: now.toISOString(),
            }
          : null,
        user: team
          ? {
              id: user.$id,
              email: user.email,
              firstName: firstName || null,
              lastName: lastNameParts.join(' ') || null,
              phoneNumber: user.phone || null,
              emailVerifiedAt: user.emailVerification
                ? (user.$updatedAt ?? now.toISOString())
                : null,
              phoneVerifiedAt: user.phoneVerification
                ? (user.$updatedAt ?? now.toISOString())
                : null,
              status: user.status ? 'ACTIVE' : 'SUSPENDED',
            }
          : null,
        organization: team
          ? {
              id: team.$id,
              name: team.name,
              slug: this.slugify(team.name),
              status: 'ACTIVE',
              primaryEmail: user.email,
              primaryPhone: user.phone || null,
              acceptedTermsAt: null,
            }
          : null,
        roles,
        memberships:
          team && membership
            ? [
                {
                  id: membership.$id,
                  organizationId: team.$id,
                  role: roles[0] ?? 'merchant_staff',
                  status: membership.confirm ? 'ACTIVE' : 'PENDING',
                },
              ]
            : [],
      };
    } catch (error) {
      this.logger.warn(
        `Appwrite JWT validation failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw error;
    }
  }

  private async findAppwriteMembership({
    endpoint,
    projectId,
    jwt,
    teamId,
    userId,
  }: {
    endpoint: string;
    projectId: string;
    jwt: string;
    teamId: string;
    userId: string;
  }) {
    const memberships = await this.appwriteRequest<{
      memberships: Array<{
        $id: string;
        userId: string;
        roles: string[];
        confirm: boolean;
      }>;
    }>({
      endpoint,
      projectId,
      jwt,
      path: `/teams/${encodeURIComponent(teamId)}/memberships`,
    });

    return (
      memberships.memberships.find(
        (membership) => membership.userId === userId,
      ) ?? null
    );
  }

  private async appwriteRequest<T>({
    endpoint,
    projectId,
    jwt,
    path,
  }: {
    endpoint: string;
    projectId: string;
    jwt: string;
    path: string;
  }): Promise<T> {
    const url = new URL(
      path.replace(/^\//, ''),
      endpoint.endsWith('/') ? endpoint : `${endpoint}/`,
    );
    let response: globalThis.Response;

    try {
      response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'x-appwrite-project': projectId,
          'x-appwrite-jwt': jwt,
        },
      });
    } catch (error) {
      this.logger.error(
        `Appwrite authentication request failed for ${path}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException(
        'Appwrite authentication is currently unavailable',
      );
    }

    const payload = await this.readPayload(response);

    if (!response.ok) {
      throw this.buildUpstreamException(response.status, payload);
    }

    return payload as T;
  }

  private extractBearerToken(request: Request): string | null {
    const authorization = request.header('authorization')?.trim();
    if (!authorization?.toLowerCase().startsWith('bearer ')) {
      return null;
    }

    const token = authorization.replace(/^bearer\s+/i, '').trim();
    return token || null;
  }

  private isBearerAuthorization(authorization?: string): boolean {
    return Boolean(authorization && /^bearer(?:\s|$)/i.test(authorization));
  }

  private mapAppwriteRoles(roles: string[]): string[] {
    if (roles.includes('platform_admin')) return ['platform_admin'];
    if (roles.includes('owner') || roles.includes('merchant_owner')) {
      return ['merchant_owner'];
    }
    if (roles.includes('admin') || roles.includes('merchant_admin')) {
      return ['merchant_admin'];
    }
    return ['merchant_staff'];
  }

  private slugify(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'appwrite-organization'
    );
  }
}
