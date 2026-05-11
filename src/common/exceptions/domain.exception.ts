import { HttpStatus } from '@nestjs/common';

export class DomainException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
