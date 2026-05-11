import { IsOptional, IsString, IsUUID } from 'class-validator';

export class QueryAuditLogsDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  entityType?: string;
}
