import type { WasteReasonCode } from '@prisma/client';

export type WastageSeverity = 'low' | 'medium' | 'high';

export interface WastageInsight {
  type: string;
  severity: WastageSeverity;
  title: string;
  message: string;
  action: string;
  metadata: Record<string, unknown>;
}

export interface WastageReasonAggregate {
  reasonCode: WasteReasonCode;
  totalCost: string;
  eventCount: number;
}
