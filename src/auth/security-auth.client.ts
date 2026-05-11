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
}
