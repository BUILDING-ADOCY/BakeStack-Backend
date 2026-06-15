import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { SupplierMessagingService } from './supplier-messaging.service';

@Module({
  imports: [AuditModule],
  controllers: [ProcurementController],
  providers: [ProcurementService, SupplierMessagingService],
  exports: [ProcurementService, SupplierMessagingService],
})
export class ProcurementModule {}
