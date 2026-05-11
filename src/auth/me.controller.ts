import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

@Controller()
export class MeController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  getSession(@Req() request: Request) {
    return this.authService.getSession(request);
  }
}
