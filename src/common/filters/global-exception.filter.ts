import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import type { Response } from 'express';
import { DomainException } from '../exceptions/domain.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainException) {
      response.status(exception.status).json({
        success: false,
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      });
      return;
    }

    if (exception instanceof PrismaClientKnownRequestError) {
      const status =
        exception.code === 'P2025'
          ? HttpStatus.NOT_FOUND
          : exception.code === 'P2002'
            ? HttpStatus.CONFLICT
            : HttpStatus.BAD_REQUEST;

      response.status(status).json({
        success: false,
        error: {
          code: exception.code,
          message:
            exception.code === 'P2002'
              ? 'A unique constraint was violated'
              : exception.message,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : Array.isArray((exceptionResponse as { message?: unknown }).message)
            ? (exceptionResponse as { message: string[] }).message.join(', ')
            : ((exceptionResponse as { message?: string }).message ??
              exception.message);

      response.status(status).json({
        success: false,
        error: {
          code:
            status === HttpStatus.BAD_REQUEST
              ? 'VALIDATION_ERROR'
              : 'HTTP_ERROR',
          message,
        },
      });
      return;
    }

    const message =
      exception instanceof Error ? exception.message : 'Unexpected error';
    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(message, stack);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message,
      },
    });
  }
}
