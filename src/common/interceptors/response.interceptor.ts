import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

type ResponsePayload<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ResponsePayload<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponsePayload<T>> {
    return next.handle().pipe(
      map((value: ResponsePayload<T> | T) => {
        if (
          value &&
          typeof value === 'object' &&
          'success' in (value as Record<string, unknown>)
        ) {
          return value as ResponsePayload<T>;
        }

        if (
          value &&
          typeof value === 'object' &&
          'data' in (value as Record<string, unknown>)
        ) {
          const payload = value as ResponsePayload<T>;
          return {
            success: true,
            data: payload.data as T,
            message: payload.message ?? 'Operation completed successfully',
          };
        }

        return {
          success: true,
          data: value as T,
          message: 'Operation completed successfully',
        };
      }),
    );
  }
}
