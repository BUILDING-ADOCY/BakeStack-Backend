import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  EmailRequestDto,
  FirebaseOauthDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SignupDto,
  StartStepUpDto,
  VerifyEmailDto,
  VerifyStepUpDto,
} from './auth.dto';
import { IdentityProvisioningService } from './identity-provisioning.service';
import { SecurityAuthClient } from './security-auth.client';

@Injectable()
export class AuthService {
  private static readonly csrfCookieName = 'bk_csrf';

  constructor(
    private readonly securityAuthClient: SecurityAuthClient,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  appendCsrfHeader(request: Request, response: Response) {
    const csrfToken = this.extractCookieValue(
      request,
      AuthService.csrfCookieName,
    );

    if (csrfToken) {
      response.setHeader('x-csrf-token', csrfToken);
    }
  }

  async getSession(request: Request) {
    const session =
      request.identity ??
      (await this.securityAuthClient.validateRequestSession(request));

    const provisioned =
      session.valid && session.user && session.organization
        ? await this.identityProvisioningService.ensureProvisionedIdentity(
            session,
          )
        : null;

    return {
      data: {
        authenticated: session.valid,
        user: session.user,
        session: session.session,
        organization: session.organization,
        roles: session.roles,
        memberships: session.memberships,
        tenantId: provisioned?.tenant.id ?? null,
        backendUserId: provisioned?.user.id ?? null,
        onboardingCompleted:
          provisioned?.onboardingProgress.isCompleted ?? false,
        onboardingProgress: provisioned?.onboardingProgress ?? null,
      },
      message: session.valid
        ? 'Authenticated session retrieved successfully'
        : 'No active authenticated session found',
    };
  }

  async register(request: Request, response: Response, dto: RegisterDto) {
    const session = await this.securityAuthClient.register(
      request,
      response,
      dto,
    );
    const provisioned =
      session.valid && session.user && session.organization
        ? await this.identityProvisioningService.ensureProvisionedIdentity(
            session,
          )
        : null;

    return {
      data: {
        authenticated: session.valid,
        user: session.user,
        session: session.session,
        organization: session.organization,
        roles: session.roles,
        memberships: session.memberships,
        tenantId: provisioned?.tenant.id ?? null,
        backendUserId: provisioned?.user.id ?? null,
        onboardingCompleted:
          provisioned?.onboardingProgress.isCompleted ?? false,
        onboardingProgress: provisioned?.onboardingProgress ?? null,
      },
      message: 'Account created successfully',
    };
  }

  async signup(request: Request, dto: SignupDto) {
    return {
      data: await this.securityAuthClient.signup(request, dto),
      message: 'Signup request processed successfully',
    };
  }

  async login(request: Request, response: Response, dto: LoginDto) {
    const session = await this.securityAuthClient.login(request, response, dto);
    const provisioned =
      session.valid && session.user && session.organization
        ? await this.identityProvisioningService.ensureProvisionedIdentity(
            session,
          )
        : null;

    return {
      data: {
        authenticated: session.valid,
        user: session.user,
        session: session.session,
        organization: session.organization,
        roles: session.roles,
        memberships: session.memberships,
        tenantId: provisioned?.tenant.id ?? null,
        backendUserId: provisioned?.user.id ?? null,
        onboardingCompleted:
          provisioned?.onboardingProgress.isCompleted ?? false,
        onboardingProgress: provisioned?.onboardingProgress ?? null,
      },
      message: 'Login completed successfully',
    };
  }

  async loginWithFirebase(
    request: Request,
    response: Response,
    dto: FirebaseOauthDto,
  ) {
    const session = await this.securityAuthClient.loginWithFirebase(
      request,
      response,
      dto,
    );
    const provisioned =
      session.valid && session.user && session.organization
        ? await this.identityProvisioningService.ensureProvisionedIdentity(
            session,
          )
        : null;

    return {
      data: {
        authenticated: session.valid,
        user: session.user,
        session: session.session,
        organization: session.organization,
        roles: session.roles,
        memberships: session.memberships,
        tenantId: provisioned?.tenant.id ?? null,
        backendUserId: provisioned?.user.id ?? null,
        onboardingCompleted:
          provisioned?.onboardingProgress.isCompleted ?? false,
        onboardingProgress: provisioned?.onboardingProgress ?? null,
      },
      message: 'Login completed successfully',
    };
  }

  async logout(request: Request, response: Response) {
    await this.securityAuthClient.logout(request, response);
    return {
      data: null,
      message: 'Logout completed successfully',
    };
  }

  async logoutAll(request: Request, response: Response) {
    await this.securityAuthClient.logoutAll(request, response);
    return {
      data: null,
      message: 'Logout completed successfully',
    };
  }

  async requestEmailVerification(request: Request, dto: EmailRequestDto) {
    return {
      data: await this.securityAuthClient.requestEmailVerification(
        request,
        dto,
      ),
      message: 'Email verification request processed successfully',
    };
  }

  async confirmEmailVerification(request: Request, dto: VerifyEmailDto) {
    return {
      data: await this.securityAuthClient.confirmEmailVerification(
        request,
        dto,
      ),
      message: 'Email verification completed successfully',
    };
  }

  async forgotPassword(request: Request, dto: ForgotPasswordDto) {
    return {
      data: await this.securityAuthClient.forgotPassword(request, dto),
      message: 'Password reset request processed successfully',
    };
  }

  async resetPassword(request: Request, dto: ResetPasswordDto) {
    return {
      data: await this.securityAuthClient.resetPassword(request, dto),
      message: 'Password reset completed successfully',
    };
  }

  async startStepUp(request: Request, dto: StartStepUpDto) {
    return {
      data: await this.securityAuthClient.startStepUp(request, dto),
      message: 'Step-up verification started successfully',
    };
  }

  async verifyStepUp(request: Request, dto: VerifyStepUpDto) {
    return {
      data: await this.securityAuthClient.verifyStepUp(request, dto),
      message: 'Step-up verification completed successfully',
    };
  }

  private extractCookieValue(
    request: Request,
    cookieName: string,
  ): string | undefined {
    const cookieHeader = request.header('cookie');
    if (!cookieHeader) {
      return undefined;
    }

    const cookies = cookieHeader.split(';').map((segment) => segment.trim());
    for (const cookie of cookies) {
      if (!cookie.startsWith(`${cookieName}=`)) {
        continue;
      }

      const rawValue = cookie.slice(cookieName.length + 1).trim();
      return rawValue ? decodeURIComponent(rawValue) : undefined;
    }

    return undefined;
  }
}
