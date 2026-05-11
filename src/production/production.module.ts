import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RecipesModule } from '../recipes/recipes.module';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';

@Module({
  imports: [RecipesModule, AuditModule],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
