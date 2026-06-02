import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DomainException } from '../common/exceptions/domain.exception';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const identity = request.identity;

    if (!identity?.valid || !identity.user || !identity.organization) {
      throw new DomainException(
        'AUTHENTICATION_REQUIRED',
        'An authenticated session is required.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return true;
  }
}
