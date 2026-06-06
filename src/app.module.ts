import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AuthenticatedGuard } from './auth/authenticated.guard';
import { AuditModule } from './audit/audit.module';
import { BusinessProfileModule } from './business-profile/business-profile.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { InventoryModule } from './inventory/inventory.module';
import { LocationsModule } from './locations/locations.module';
import { MetadataModule } from './metadata/metadata.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ProcurementModule } from './procurement/procurement.module';
import { ProductsModule } from './products/products.module';
import { ProductionModule } from './production/production.module';
import { QcModule } from './qc/qc.module';
import { RecipesModule } from './recipes/recipes.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { SalesModule } from './sales/sales.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { WastageModule } from './wastage/wastage.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    BusinessProfileModule,
    TenantsModule,
    LocationsModule,
    MetadataModule,
    OnboardingModule,
    UsersModule,
    RolesModule,
    ProductsModule,
    RecipesModule,
    QcModule,
    SuppliersModule,
    ProcurementModule,
    InventoryModule,
    ProductionModule,
    ReportsModule,
    SalesModule,
    AuditModule,
    WastageModule,
    IntegrationsModule,
    IdempotencyModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthenticatedGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, RequestLoggingMiddleware)
      .forRoutes('*');
  }
}
