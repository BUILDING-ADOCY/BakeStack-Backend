import { Test } from '@nestjs/testing';
import { InventoryMovementType, WasteReasonCode } from '@prisma/client';
import { randomUUID } from 'crypto';
import { config as loadEnv } from 'dotenv';
import { AuditService } from '../../src/audit/audit.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { IdempotencyService } from '../../src/idempotency/idempotency.service';
import { CreateWasteEventDto } from '../../src/wastage/dto/create-waste-event.dto';
import { WastageService } from '../../src/wastage/wastage.service';

// Drives WastageService against the real Postgres configured in .env (DATABASE_URL).
// We exercise the service directly rather than over HTTP because the controller's
// tenant resolution depends on the external security service for identity
// provisioning; the acceptance criteria here are the database side effects
// (ledger movement, balance delta, audit rows, transactional rollback).
describe('Wastage (e2e, real database)', () => {
  let prisma: PrismaService;
  let service: WastageService;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  let userAId: string;
  let locationAId: string;
  let itemAId: string;
  let locationBId: string;
  let itemBId: string;

  const OPENING_QTY = 100;
  const UNIT_COST = 5;

  const dto = (
    overrides: Partial<CreateWasteEventDto> = {},
  ): CreateWasteEventDto =>
    ({
      locationId: locationAId,
      inventoryItemId: itemAId,
      quantity: '10',
      uom: 'kg',
      reasonCode: WasteReasonCode.DAMAGED,
      ...overrides,
    }) as CreateWasteEventDto;

  const onHand = async (
    locationId = locationAId,
    inventoryItemId = itemAId,
    tenantId = tenantAId,
  ): Promise<number> => {
    const balance = await prisma.inventoryBalance.findFirst({
      where: { tenantId, locationId, inventoryItemId, lotId: null },
    });
    return Number(balance?.onHandQty ?? 0);
  };

  beforeAll(async () => {
    loadEnv();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        AuditService,
        IdempotencyService,
        WastageService,
      ],
    }).compile();

    service = moduleRef.get(WastageService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();

    // Tenant A — fully stocked graph used by the happy-path assertions.
    await prisma.tenant.create({
      data: {
        id: tenantAId,
        name: `e2e-waste-A-${tenantAId.slice(0, 8)}`,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
      },
    });
    const userA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `waste-${tenantAId.slice(0, 8)}@e2e.test`,
        displayName: 'E2E Actor',
      },
    });
    userAId = userA.id;
    const locationA = await prisma.location.create({
      data: { tenantId: tenantAId, name: 'E2E Bakery A', type: 'BAKERY' },
    });
    locationAId = locationA.id;
    const itemA = await prisma.inventoryItem.create({
      data: {
        tenantId: tenantAId,
        name: 'E2E Flour A',
        type: 'RAW_MATERIAL',
        defaultUom: 'kg',
        unitCost: UNIT_COST,
      },
    });
    itemAId = itemA.id;
    await prisma.inventoryBalance.create({
      data: {
        tenantId: tenantAId,
        locationId: locationAId,
        inventoryItemId: itemAId,
        lotId: null,
        onHandQty: OPENING_QTY,
        availableQty: OPENING_QTY,
        reservedQty: 0,
      },
    });

    // Tenant B — exists only so Tenant A can attempt to reference its rows.
    await prisma.tenant.create({
      data: {
        id: tenantBId,
        name: `e2e-waste-B-${tenantBId.slice(0, 8)}`,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
      },
    });
    const locationB = await prisma.location.create({
      data: { tenantId: tenantBId, name: 'E2E Bakery B', type: 'BAKERY' },
    });
    locationBId = locationB.id;
    const itemB = await prisma.inventoryItem.create({
      data: {
        tenantId: tenantBId,
        name: 'E2E Flour B',
        type: 'RAW_MATERIAL',
        defaultUom: 'kg',
        unitCost: UNIT_COST,
      },
    });
    itemBId = itemB.id;
  });

  afterAll(async () => {
    if (prisma) {
      // Tenant cascade removes locations, items, balances, movements, events, audits.
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenantAId, tenantBId] } },
      });
      await prisma.$disconnect();
    }
  });

  it('records a waste event with ledger movement, balance delta, and audit row', async () => {
    const before = await onHand();

    const event = await service.recordWasteEvent(
      tenantAId,
      userAId,
      dto({ quantity: '10' }),
    );

    const events = await prisma.wasteEvent.findMany({
      where: { tenantId: tenantAId, id: event.id },
    });
    expect(events).toHaveLength(1);
    expect(Number(events[0].costImpact)).toBe(10 * UNIT_COST);

    const movements = await prisma.inventoryMovement.findMany({
      where: {
        tenantId: tenantAId,
        movementType: InventoryMovementType.WASTAGE,
        referenceType: 'WasteEvent',
        referenceId: event.id,
      },
    });
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(-10);

    expect(await onHand()).toBe(before - 10);

    const audits = await prisma.auditLog.findMany({
      where: {
        tenantId: tenantAId,
        action: 'wastage.recorded',
        entityType: 'WasteEvent',
        entityId: event.id,
      },
    });
    expect(audits).toHaveLength(1);
  });

  it('voids a waste event, restoring stock and writing a second audit row', async () => {
    const before = await onHand();

    const event = await service.recordWasteEvent(
      tenantAId,
      userAId,
      dto({ quantity: '4' }),
    );
    expect(await onHand()).toBe(before - 4);

    const voided = await service.voidWasteEvent(tenantAId, userAId, event.id, {
      reason: 'recorded in error',
    });
    expect(voided.voidedAt).toBeTruthy();
    expect(voided.voidedById).toBe(userAId);

    // Stock fully restored.
    expect(await onHand()).toBe(before);

    const voidMovements = await prisma.inventoryMovement.findMany({
      where: {
        tenantId: tenantAId,
        referenceType: 'WasteEventVoid',
        referenceId: event.id,
      },
    });
    expect(voidMovements).toHaveLength(1);
    expect(Number(voidMovements[0].quantity)).toBe(4);

    const audits = await prisma.auditLog.findMany({
      where: { tenantId: tenantAId, entityId: event.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual([
      'wastage.recorded',
      'wastage.voided',
    ]);
  });

  it('bulk-records three events as three movements and three audit rows', async () => {
    const before = await onHand();

    const result = await service.bulkRecordWasteEvents(tenantAId, userAId, {
      events: [
        dto({ quantity: '5' }),
        dto({ quantity: '5' }),
        dto({ quantity: '5' }),
      ],
    });
    expect(result.created).toHaveLength(3);

    const ids = result.created.map((e) => e.id);
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        tenantId: tenantAId,
        movementType: InventoryMovementType.WASTAGE,
        referenceId: { in: ids },
      },
    });
    expect(movements).toHaveLength(3);

    const audits = await prisma.auditLog.findMany({
      where: {
        tenantId: tenantAId,
        action: 'wastage.recorded',
        entityId: { in: ids },
      },
    });
    expect(audits).toHaveLength(3);

    expect(await onHand()).toBe(before - 15);
  });

  it('rolls the whole bulk back when one event fails (atomicity)', async () => {
    const beforeBalance = await onHand();
    const beforeCount = await prisma.wasteEvent.count({
      where: { tenantId: tenantAId },
    });

    await expect(
      service.bulkRecordWasteEvents(tenantAId, userAId, {
        events: [
          dto({ quantity: '5' }),
          dto({ quantity: '100000' }), // exceeds available stock → fails inside the tx
          dto({ quantity: '5' }),
        ],
      }),
    ).rejects.toMatchObject({ code: 'WASTAGE_INSUFFICIENT_STOCK' });

    // Nothing persisted: count and balance are unchanged.
    expect(
      await prisma.wasteEvent.count({ where: { tenantId: tenantAId } }),
    ).toBe(beforeCount);
    expect(await onHand()).toBe(beforeBalance);
  });

  it('rejects cross-tenant access with a 404 tenant-mismatch (no existence leak)', async () => {
    await expect(
      service.recordWasteEvent(tenantAId, userAId, {
        locationId: locationBId,
        inventoryItemId: itemBId,
        quantity: '1',
        uom: 'kg',
        reasonCode: WasteReasonCode.DAMAGED,
      } as CreateWasteEventDto),
    ).rejects.toMatchObject({ code: 'WASTAGE_TENANT_MISMATCH', status: 404 });
  });
});
