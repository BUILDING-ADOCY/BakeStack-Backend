import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsString()
  organizationName!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class RegisterDto extends SignupDto {}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class FirebaseOauthDto {
  @IsString()
  idToken!: string;

  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class EmailRequestDto {
  @IsEmail()
  email!: string;
}

export class VerifyEmailDto {
  @IsString()
  token!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(12)
  password!: string;
}

export class StartStepUpDto {
  @IsString()
  channel!: string;

  @IsString()
  purpose!: string;

  @IsOptional()
  @IsString()
  target?: string;
}

export class VerifyStepUpDto {
  @IsString()
  challengeId!: string;

  @IsString()
  code!: string;
}
