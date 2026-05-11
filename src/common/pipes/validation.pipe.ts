import { BadRequestException, ValidationPipe } from '@nestjs/common';

export const buildValidationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (errors) =>
      new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      ),
  });
