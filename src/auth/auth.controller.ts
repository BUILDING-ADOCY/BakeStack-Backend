import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import {
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

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  getSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.authService.appendCsrfHeader(request, response);
    return this.authService.getSession(request);
  }

  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: RegisterDto,
  ) {
    return this.authService.register(request, response, dto);
  }

  @Post('signup')
  signup(@Req() request: Request, @Body() dto: SignupDto) {
    return this.authService.signup(request, dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: LoginDto,
  ) {
    return this.authService.login(request, response, dto);
  }

  @Post('oauth/firebase')
  @HttpCode(HttpStatus.OK)
  loginWithFirebase(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: FirebaseOauthDto,
  ) {
    return this.authService.loginWithFirebase(request, response, dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.logout(request, response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  logoutAll(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.logoutAll(request, response);
  }

  @Post('verify-email/request')
  @HttpCode(HttpStatus.OK)
  requestEmailVerification(
    @Req() request: Request,
    @Body() dto: EmailRequestDto,
  ) {
    return this.authService.requestEmailVerification(request, dto);
  }

  @Post('verify-email/confirm')
  @HttpCode(HttpStatus.OK)
  confirmEmailVerification(
    @Req() request: Request,
    @Body() dto: VerifyEmailDto,
  ) {
    return this.authService.confirmEmailVerification(request, dto);
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Req() request: Request, @Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(request, dto);
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Req() request: Request, @Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(request, dto);
  }

  @Post('step-up/start')
  @HttpCode(HttpStatus.OK)
  startStepUp(@Req() request: Request, @Body() dto: StartStepUpDto) {
    return this.authService.startStepUp(request, dto);
  }

  @Post('step-up/verify')
  @HttpCode(HttpStatus.OK)
  verifyStepUp(@Req() request: Request, @Body() dto: VerifyStepUpDto) {
    return this.authService.verifyStepUp(request, dto);
  }
}
