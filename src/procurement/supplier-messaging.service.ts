import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  ID,
  Messaging,
  MessagingProviderType,
  Query,
  Users,
} from 'node-appwrite';
import {
  Prisma,
  ProcurementRequestStatus,
  SupplierMessageChannel,
  SupplierMessageSenderType,
  SupplierMessageStatus,
  SupplierRequestStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';

export const SUPPLIER_MESSAGING_PROVIDER_WARNING =
  'Appwrite Messaging email provider is not configured. Configure an email provider in Appwrite Console to send supplier messages.';

export const SUPPLIER_EMAIL_MISSING_WARNING =
  'Supplier email is missing. Add supplier email before sending message.';

const supplierRequestMessagingInclude = {
  supplier: true,
  procurementRequest: {
    include: {
      location: true,
    },
  },
  items: {
    include: {
      inventoryItem: true,
      supplierItem: true,
      procurementRequestItem: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  thread: {
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  },
} satisfies Prisma.SupplierRequestInclude;

type SupplierRequestForMessaging = Prisma.SupplierRequestGetPayload<{
  include: typeof supplierRequestMessagingInclude;
}>;

type AppwriteProvider = {
  $id: string;
  name?: string;
  provider?: string;
  enabled?: boolean;
  type?: string;
};

type AppwriteMessage = {
  $id: string;
};

type AppwriteTarget = {
  $id: string;
};

type MessagingChannel = 'EMAIL' | 'SMS';

interface ProviderCheck {
  providerReady: boolean;
  providerId?: string;
  warnings: string[];
}

interface TargetResult extends ProviderCheck {
  channel: MessagingChannel;
  targetId?: string;
}

interface DraftContent {
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class SupplierMessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async ensureSupplierMessagingTarget(
    tenantId: string,
    supplierId: string,
    channel: MessagingChannel = SupplierMessageChannel.EMAIL,
  ): Promise<TargetResult> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { tenantId, id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new DomainException(
        'SUPPLIER_NOT_FOUND',
        'Supplier not found for this tenant',
        404,
      );
    }

    const provider = await this.checkProvider(channel);
    if (!provider.providerReady) {
      return { ...provider, channel };
    }

    const targetValue =
      channel === SupplierMessageChannel.EMAIL
        ? supplier.email
        : supplier.phone;
    if (!targetValue) {
      return {
        ...provider,
        channel,
        providerReady: false,
        warnings: [
          channel === SupplierMessageChannel.EMAIL
            ? SUPPLIER_EMAIL_MISSING_WARNING
            : 'Supplier phone is required before sending an SMS request.',
        ],
      };
    }

    const existingTargetId =
      channel === SupplierMessageChannel.EMAIL
        ? supplier.emailTargetId
        : supplier.smsTargetId;
    if (existingTargetId) {
      return {
        ...provider,
        channel,
        targetId: existingTargetId,
      };
    }

    const { users } = this.createAppwriteServices();
    const appwriteUserId =
      supplier.appwriteUserId ??
      (await this.findOrCreateSupplierUser(
        users,
        supplier.name,
        channel,
        targetValue,
      ));
    const target = (await users.createTarget({
      userId: appwriteUserId,
      targetId: ID.unique(),
      providerType:
        channel === SupplierMessageChannel.EMAIL
          ? MessagingProviderType.Email
          : MessagingProviderType.Sms,
      identifier: targetValue,
      providerId: provider.providerId,
      name: `${supplier.name} ${channel.toLowerCase()}`.slice(0, 128),
    })) as AppwriteTarget;

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        appwriteUserId,
        emailTargetId:
          channel === SupplierMessageChannel.EMAIL
            ? target.$id
            : supplier.emailTargetId,
        smsTargetId:
          channel === SupplierMessageChannel.SMS
            ? target.$id
            : supplier.smsTargetId,
        messagingStatus: 'TARGET_READY',
      },
    });

    return {
      ...provider,
      channel,
      targetId: target.$id,
    };
  }

  async generateSupplierMessageDraft(
    tenantId: string,
    supplierRequestId: string,
    actorId?: string | null,
  ) {
    const supplierRequest = await this.getSupplierRequest(
      tenantId,
      supplierRequestId,
    );
    if (!supplierRequest.thread) {
      throw new DomainException(
        'SUPPLIER_THREAD_NOT_FOUND',
        'Supplier conversation thread not found',
        404,
      );
    }

    const content = this.buildSupplierRequestDraft(supplierRequest);
    const existingDraft = this.findOutboundMessage(supplierRequest);
    const message = existingDraft
      ? await this.prisma.supplierMessage.update({
          where: { id: existingDraft.id },
          data: {
            supplierId: supplierRequest.supplierId,
            subject: content.subject,
            messageBody: content.text,
            messageBodyText: content.text,
            messageBodyHtml: content.html,
            messageStatus: SupplierMessageStatus.DRAFT,
            failureReason: null,
          },
        })
      : await this.prisma.supplierMessage.create({
          data: {
            tenantId,
            threadId: supplierRequest.thread.id,
            supplierRequestId,
            supplierId: supplierRequest.supplierId,
            senderType: SupplierMessageSenderType.BAKERY_USER,
            senderId: actorId,
            channel: supplierRequest.messageChannel,
            subject: content.subject,
            messageBody: content.text,
            messageBodyText: content.text,
            messageBodyHtml: content.html,
            messageStatus: SupplierMessageStatus.DRAFT,
          },
        });

    await this.prisma.supplierMessageThread.update({
      where: { id: supplierRequest.thread.id },
      data: { subject: content.subject, lastMessageAt: new Date() },
    });

    await this.auditService.log({
      tenantId,
      actorId,
      action: 'SUPPLIER_MESSAGE_DRAFT_CREATED',
      entityType: 'SupplierRequest',
      entityId: supplierRequestId,
      afterJson: {
        messageId: message.id,
        subject: content.subject,
      } as Prisma.InputJsonValue,
    });

    return message;
  }

  async sendSupplierRequestMessage(
    tenantId: string,
    supplierRequestId: string,
    actorId?: string | null,
    channel: MessagingChannel = SupplierMessageChannel.EMAIL,
  ) {
    const supplierRequest = await this.getSupplierRequest(
      tenantId,
      supplierRequestId,
    );
    const draft =
      this.findOutboundMessage(supplierRequest) ??
      (await this.generateSupplierMessageDraft(
        tenantId,
        supplierRequestId,
        actorId,
      ));

    const provider = await this.checkProvider(channel);
    if (!provider.providerReady) {
      await this.markSendFailure({
        tenantId,
        supplierRequestId,
        messageId: draft.id,
        supplierId: supplierRequest.supplierId,
        status: SupplierMessageStatus.FAILED_PROVIDER_NOT_CONFIGURED,
        failureReason: SUPPLIER_MESSAGING_PROVIDER_WARNING,
        actorId,
      });
      return {
        ...(await this.getSupplierRequest(tenantId, supplierRequestId)),
        warning: SUPPLIER_MESSAGING_PROVIDER_WARNING,
      };
    }

    const target = await this.ensureSupplierMessagingTarget(
      tenantId,
      supplierRequest.supplierId,
      channel,
    );
    if (!target.targetId) {
      const failureReason =
        target.warnings[0] ??
        (channel === SupplierMessageChannel.EMAIL
          ? 'Supplier email target is not available.'
          : 'Supplier SMS target is not available.');
      await this.markSendFailure({
        tenantId,
        supplierRequestId,
        messageId: draft.id,
        supplierId: supplierRequest.supplierId,
        status: SupplierMessageStatus.FAILED_TARGET_NOT_FOUND,
        failureReason,
        actorId,
      });
      return {
        ...(await this.getSupplierRequest(tenantId, supplierRequestId)),
        warning: failureReason,
      };
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.supplierMessage.update({
        where: { id: draft.id },
        data: {
          messageStatus: SupplierMessageStatus.SENDING,
          appwriteProviderId: provider.providerId,
          appwriteTargetId: target.targetId,
          failureReason: null,
        },
      });
      await tx.supplierRequest.update({
        where: { id: supplierRequestId },
        data: {
          messageStatus: SupplierMessageStatus.SENDING,
          messageChannel: channel,
        },
      });
      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: 'SUPPLIER_MESSAGE_SEND_STARTED',
          entityType: 'SupplierRequest',
          entityId: supplierRequestId,
          afterJson: {
            messageId: draft.id,
            channel,
            targetId: target.targetId,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
    });

    try {
      const { messaging } = this.createAppwriteServices();
      const content = this.resolveDraftContent(draft, supplierRequest);
      const appwriteMessage =
        channel === SupplierMessageChannel.EMAIL
          ? ((await messaging.createEmail({
              messageId: ID.unique(),
              subject: content.subject,
              content: content.html,
              targets: [target.targetId],
              html: true,
            })) as AppwriteMessage)
          : ((await messaging.createSms({
              messageId: ID.unique(),
              content: content.text,
              targets: [target.targetId],
            })) as AppwriteMessage);

      await this.prisma.$transaction(async (tx) => {
        await tx.supplierMessage.update({
          where: { id: draft.id },
          data: {
            messageStatus: SupplierMessageStatus.SENT,
            appwriteMessageId: appwriteMessage.$id,
            appwriteProviderId: provider.providerId,
            appwriteTargetId: target.targetId,
            externalMessageId: appwriteMessage.$id,
            failureReason: null,
            sentAt: now,
          },
        });
        await tx.supplierMessageThread.update({
          where: { id: supplierRequest.thread!.id },
          data: {
            status: 'AWAITING_REPLY',
            lastMessageAt: now,
          },
        });
        await tx.supplierRequest.update({
          where: { id: supplierRequestId },
          data: {
            status: SupplierRequestStatus.AWAITING_REPLY,
            messageStatus: SupplierMessageStatus.SENT,
            messageChannel: channel,
            sentAt: now,
          },
        });
        await tx.supplier.update({
          where: { id: supplierRequest.supplierId },
          data: {
            messagingStatus: 'SENT',
            lastMessageSentAt: now,
          },
        });
        await tx.procurementRequest.update({
          where: { id: supplierRequest.procurementRequestId },
          data: { status: ProcurementRequestStatus.SUPPLIER_MESSAGE_SENT },
        });
        await this.auditService.log(
          {
            tenantId,
            actorId,
            action: 'SUPPLIER_MESSAGE_SENT',
            entityType: 'SupplierRequest',
            entityId: supplierRequestId,
            afterJson: {
              messageId: draft.id,
              appwriteMessageId: appwriteMessage.$id,
              channel,
            } as Prisma.InputJsonValue,
          },
          tx,
        );
      });
    } catch (error) {
      const failureReason = this.safeErrorMessage(error);
      await this.markSendFailure({
        tenantId,
        supplierRequestId,
        messageId: draft.id,
        supplierId: supplierRequest.supplierId,
        status: SupplierMessageStatus.FAILED,
        failureReason,
        actorId,
      });
      return {
        ...(await this.getSupplierRequest(tenantId, supplierRequestId)),
        warning: failureReason,
      };
    }

    return this.getSupplierRequest(tenantId, supplierRequestId);
  }

  async sendSupplierReminderMessage(
    tenantId: string,
    supplierRequestId: string,
    actorId?: string | null,
  ) {
    const supplierRequest = await this.getSupplierRequest(
      tenantId,
      supplierRequestId,
    );
    const reminderStatuses: SupplierRequestStatus[] = [
      SupplierRequestStatus.SENT,
      SupplierRequestStatus.AWAITING_REPLY,
      SupplierRequestStatus.DELIVERED,
    ];
    if (!reminderStatuses.includes(supplierRequest.status)) {
      throw new DomainException(
        'SUPPLIER_REMINDER_NOT_ALLOWED',
        'Reminder can only be sent after the supplier request has been sent',
        409,
      );
    }

    const now = new Date();
    if (
      supplierRequest.lastReminderAt &&
      now.getTime() - supplierRequest.lastReminderAt.getTime() <
        24 * 60 * 60 * 1000
    ) {
      throw new DomainException(
        'SUPPLIER_REMINDER_TOO_SOON',
        'A reminder was already sent in the last 24 hours',
        409,
      );
    }

    const channel =
      supplierRequest.messageChannel === SupplierMessageChannel.SMS
        ? SupplierMessageChannel.SMS
        : SupplierMessageChannel.EMAIL;
    const provider = await this.checkProvider(channel);
    const content = this.buildSupplierReminderDraft(supplierRequest);
    const message = await this.prisma.supplierMessage.create({
      data: {
        tenantId,
        threadId: supplierRequest.thread!.id,
        supplierRequestId,
        supplierId: supplierRequest.supplierId,
        senderType: SupplierMessageSenderType.SYSTEM,
        senderId: actorId,
        channel,
        subject: content.subject,
        messageBody: content.text,
        messageBodyText: content.text,
        messageBodyHtml: content.html,
        messageStatus: provider.providerReady
          ? SupplierMessageStatus.SENDING
          : SupplierMessageStatus.FAILED_PROVIDER_NOT_CONFIGURED,
        failureReason: provider.providerReady
          ? null
          : SUPPLIER_MESSAGING_PROVIDER_WARNING,
      },
    });

    if (!provider.providerReady) {
      await this.auditService.log({
        tenantId,
        actorId,
        action: 'SUPPLIER_MESSAGE_FAILED',
        entityType: 'SupplierRequest',
        entityId: supplierRequestId,
        afterJson: {
          messageId: message.id,
          reason: SUPPLIER_MESSAGING_PROVIDER_WARNING,
        } as Prisma.InputJsonValue,
      });
      return {
        ...(await this.getSupplierRequest(tenantId, supplierRequestId)),
        warning: SUPPLIER_MESSAGING_PROVIDER_WARNING,
      };
    }

    const target = await this.ensureSupplierMessagingTarget(
      tenantId,
      supplierRequest.supplierId,
      channel,
    );
    if (!target.targetId) {
      const failureReason =
        target.warnings[0] ?? 'Supplier target is not available.';
      await this.markSendFailure({
        tenantId,
        supplierRequestId,
        messageId: message.id,
        supplierId: supplierRequest.supplierId,
        status: SupplierMessageStatus.FAILED_TARGET_NOT_FOUND,
        failureReason,
        actorId,
      });
      return {
        ...(await this.getSupplierRequest(tenantId, supplierRequestId)),
        warning: failureReason,
      };
    }

    try {
      const { messaging } = this.createAppwriteServices();
      const appwriteMessage =
        channel === SupplierMessageChannel.EMAIL
          ? ((await messaging.createEmail({
              messageId: ID.unique(),
              subject: content.subject,
              content: content.html,
              targets: [target.targetId],
              html: true,
            })) as AppwriteMessage)
          : ((await messaging.createSms({
              messageId: ID.unique(),
              content: content.text,
              targets: [target.targetId],
            })) as AppwriteMessage);

      await this.prisma.$transaction(async (tx) => {
        await tx.supplierMessage.update({
          where: { id: message.id },
          data: {
            messageStatus: SupplierMessageStatus.SENT,
            appwriteMessageId: appwriteMessage.$id,
            appwriteProviderId: provider.providerId,
            appwriteTargetId: target.targetId,
            externalMessageId: appwriteMessage.$id,
            sentAt: now,
          },
        });
        await tx.supplierRequest.update({
          where: { id: supplierRequestId },
          data: {
            lastReminderAt: now,
            reminderCount: { increment: 1 },
          },
        });
        await tx.supplierMessageThread.update({
          where: { id: supplierRequest.thread!.id },
          data: { lastMessageAt: now },
        });
        await this.auditService.log(
          {
            tenantId,
            actorId,
            action: 'SUPPLIER_REMINDER_SENT',
            entityType: 'SupplierRequest',
            entityId: supplierRequestId,
            afterJson: {
              messageId: message.id,
              appwriteMessageId: appwriteMessage.$id,
            } as Prisma.InputJsonValue,
          },
          tx,
        );
      });
    } catch (error) {
      const failureReason = this.safeErrorMessage(error);
      await this.markSendFailure({
        tenantId,
        supplierRequestId,
        messageId: message.id,
        supplierId: supplierRequest.supplierId,
        status: SupplierMessageStatus.FAILED,
        failureReason,
        actorId,
      });
      return {
        ...(await this.getSupplierRequest(tenantId, supplierRequestId)),
        warning: failureReason,
      };
    }

    return this.getSupplierRequest(tenantId, supplierRequestId);
  }

  async sendPurchaseOrderConfirmation(
    tenantId: string,
    purchaseOrderId: string,
    actorId?: string | null,
  ) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: { tenantId, id: purchaseOrderId },
      include: {
        supplier: true,
        supplierRequest: {
          include: supplierRequestMessagingInclude,
        },
        lines: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    if (!purchaseOrder?.supplierRequest) {
      return;
    }

    const provider = await this.checkProvider(SupplierMessageChannel.EMAIL);
    if (!provider.providerReady) {
      return;
    }

    const target = await this.ensureSupplierMessagingTarget(
      tenantId,
      purchaseOrder.supplierId,
      SupplierMessageChannel.EMAIL,
    );
    if (!target.targetId) {
      return;
    }

    const itemList = purchaseOrder.lines
      .map(
        (line) =>
          `- ${line.inventoryItem?.name ?? line.inventoryItemId}: ${line.orderedQty.toString()} units at ${line.unitPrice.toString()}`,
      )
      .join('\n');
    const subject = `Purchase Order ${purchaseOrder.poNumber} confirmed`;
    const text = [
      `Hello ${purchaseOrder.supplier.name},`,
      '',
      `We have confirmed Purchase Order ${purchaseOrder.poNumber}.`,
      '',
      itemList,
      '',
      purchaseOrder.expectedDeliveryDate
        ? `Expected Delivery Date: ${purchaseOrder.expectedDeliveryDate.toISOString().slice(0, 10)}`
        : null,
      '',
      'Regards,',
      this.getFromName(),
    ]
      .filter((line) => line !== null)
      .join('\n');
    const html = this.wrapEmailHtml(
      subject,
      `<p>Hello ${this.escapeHtml(purchaseOrder.supplier.name)},</p>
       <p>We have confirmed Purchase Order <strong>${this.escapeHtml(purchaseOrder.poNumber)}</strong>.</p>
       <pre>${this.escapeHtml(itemList)}</pre>
       ${
         purchaseOrder.expectedDeliveryDate
           ? `<p><strong>Expected Delivery Date:</strong> ${purchaseOrder.expectedDeliveryDate.toISOString().slice(0, 10)}</p>`
           : ''
       }
       <p>Regards,<br/>${this.escapeHtml(this.getFromName())}</p>`,
    );

    try {
      const { messaging } = this.createAppwriteServices();
      const appwriteMessage = (await messaging.createEmail({
        messageId: ID.unique(),
        subject,
        content: html,
        targets: [target.targetId],
        html: true,
      })) as AppwriteMessage;
      await this.prisma.supplierMessage.create({
        data: {
          tenantId,
          threadId: purchaseOrder.supplierRequest.thread!.id,
          supplierRequestId: purchaseOrder.supplierRequestId!,
          supplierId: purchaseOrder.supplierId,
          senderType: SupplierMessageSenderType.SYSTEM,
          senderId: actorId,
          channel: SupplierMessageChannel.EMAIL,
          subject,
          messageBody: text,
          messageBodyText: text,
          messageBodyHtml: html,
          messageStatus: SupplierMessageStatus.SENT,
          appwriteMessageId: appwriteMessage.$id,
          appwriteProviderId: provider.providerId,
          appwriteTargetId: target.targetId,
          externalMessageId: appwriteMessage.$id,
          sentAt: new Date(),
        },
      });
    } catch {
      // Purchase order creation is the business-critical action; confirmation email is best effort.
    }
  }

  async notifyInternalTeamOnSupplierResponse(
    tenantId: string,
    supplierRequestId: string,
    actorId?: string | null,
  ) {
    const topicId = this.internalProcurementTopicId(tenantId);
    const provider = await this.checkProvider(SupplierMessageChannel.EMAIL);
    if (topicId && provider.providerReady) {
      try {
        const supplierRequest = await this.getSupplierRequest(
          tenantId,
          supplierRequestId,
        );
        const { messaging } = this.createAppwriteServices();
        const subject = `Supplier response received: ${supplierRequest.procurementRequest.requestNumber}`;
        const content = [
          `Supplier ${supplierRequest.supplier.name} has responded to ${supplierRequest.procurementRequest.requestNumber}.`,
          'Action required: Review quotation.',
        ].join('\n');
        const appwriteMessage = (await messaging.createEmail({
          messageId: ID.unique(),
          subject,
          content,
          topics: [topicId],
          html: false,
        })) as AppwriteMessage;

        await this.auditService.log({
          tenantId,
          actorId,
          action: 'INTERNAL_TEAM_NOTIFIED',
          entityType: 'SupplierRequest',
          entityId: supplierRequestId,
          afterJson: {
            eventType: 'SUPPLIER_RESPONSE_ADDED',
            deliveryStatus: 'SENT',
            topicId,
            appwriteMessageId: appwriteMessage.$id,
          } as Prisma.InputJsonValue,
        });
        return;
      } catch (error) {
        await this.auditService.log({
          tenantId,
          actorId,
          action: 'INTERNAL_TEAM_NOTIFIED',
          entityType: 'SupplierRequest',
          entityId: supplierRequestId,
          afterJson: {
            eventType: 'SUPPLIER_RESPONSE_ADDED',
            deliveryStatus: 'FAILED',
            topicId,
            failureReason: this.safeErrorMessage(error),
          } as Prisma.InputJsonValue,
        });
        return;
      }
    }

    await this.auditService.log({
      tenantId,
      actorId,
      action: 'INTERNAL_TEAM_NOTIFIED',
      entityType: 'SupplierRequest',
      entityId: supplierRequestId,
      afterJson: {
        eventType: 'SUPPLIER_RESPONSE_ADDED',
        deliveryStatus: topicId
          ? 'SKIPPED_PROVIDER_NOT_CONFIGURED'
          : 'SKIPPED_NO_INTERNAL_TOPIC_CONFIGURED',
        topicId: topicId ?? null,
      } as Prisma.InputJsonValue,
    });
  }

  private async getSupplierRequest(
    tenantId: string,
    supplierRequestId: string,
  ) {
    const supplierRequest = await this.prisma.supplierRequest.findFirst({
      where: { tenantId, id: supplierRequestId },
      include: supplierRequestMessagingInclude,
    });

    if (!supplierRequest) {
      throw new DomainException(
        'SUPPLIER_REQUEST_NOT_FOUND',
        'Supplier request not found',
        404,
      );
    }

    if (!supplierRequest.thread) {
      throw new DomainException(
        'SUPPLIER_THREAD_NOT_FOUND',
        'Supplier conversation thread not found',
        404,
      );
    }

    return supplierRequest;
  }

  private findOutboundMessage(supplierRequest: SupplierRequestForMessaging) {
    return (
      supplierRequest.thread?.messages
        .filter(
          (message) =>
            message.senderType !== SupplierMessageSenderType.SUPPLIER,
        )
        .reverse()
        .find((message) => {
          const retryableStatuses: SupplierMessageStatus[] = [
            SupplierMessageStatus.DRAFT,
            SupplierMessageStatus.READY_TO_SEND,
            SupplierMessageStatus.SENDING,
            SupplierMessageStatus.FAILED,
            SupplierMessageStatus.FAILED_PROVIDER_NOT_CONFIGURED,
            SupplierMessageStatus.FAILED_TARGET_NOT_FOUND,
          ];
          return retryableStatuses.includes(message.messageStatus);
        }) ?? null
    );
  }

  private async checkProvider(
    channel: MessagingChannel,
  ): Promise<ProviderCheck> {
    const appwrite = this.readAppwriteConfig();
    if (!appwrite.endpoint || !appwrite.projectId || !appwrite.apiKey) {
      return {
        providerReady: false,
        warnings: [SUPPLIER_MESSAGING_PROVIDER_WARNING],
      };
    }

    const configuredProviderId =
      channel === SupplierMessageChannel.EMAIL
        ? this.configService.get<string>('APPWRITE_EMAIL_PROVIDER_ID')?.trim()
        : this.configService.get<string>('APPWRITE_SMS_PROVIDER_ID')?.trim();

    try {
      const { messaging } = this.createAppwriteServices();
      const providerList = (await messaging.listProviders({
        total: false,
      })) as { providers: AppwriteProvider[] };
      const provider = configuredProviderId
        ? providerList.providers.find(
            (candidate) =>
              candidate.$id === configuredProviderId &&
              candidate.enabled !== false,
          )
        : providerList.providers.find(
            (candidate) =>
              candidate.type?.toLowerCase() === channel.toLowerCase() &&
              candidate.enabled !== false,
          );

      if (!provider) {
        return {
          providerReady: false,
          warnings: [SUPPLIER_MESSAGING_PROVIDER_WARNING],
        };
      }

      return {
        providerReady: true,
        providerId: provider.$id,
        warnings: [],
      };
    } catch {
      return {
        providerReady: false,
        warnings: [SUPPLIER_MESSAGING_PROVIDER_WARNING],
      };
    }
  }

  private async findOrCreateSupplierUser(
    users: Users,
    supplierName: string,
    channel: MessagingChannel,
    identifier: string,
  ) {
    const queries =
      channel === SupplierMessageChannel.EMAIL
        ? [Query.equal('email', [identifier])]
        : [Query.equal('phone', [identifier])];
    const existing = (await users.list({ queries, total: false })) as {
      users: Array<{ $id: string }>;
    };
    if (existing.users[0]) {
      return existing.users[0].$id;
    }

    const user = (await users.create({
      userId: ID.unique(),
      email: channel === SupplierMessageChannel.EMAIL ? identifier : undefined,
      phone: channel === SupplierMessageChannel.SMS ? identifier : undefined,
      name: supplierName.slice(0, 128),
    })) as { $id: string };
    return user.$id;
  }

  private createAppwriteServices() {
    const appwrite = this.readAppwriteConfig();
    const client = new Client()
      .setEndpoint(appwrite.endpoint)
      .setProject(appwrite.projectId)
      .setKey(appwrite.apiKey);

    return {
      messaging: new Messaging(client),
      users: new Users(client),
    };
  }

  private readAppwriteConfig() {
    return {
      endpoint:
        this.configService.get<string>('APPWRITE_ENDPOINT')?.trim() ?? '',
      projectId:
        this.configService.get<string>('APPWRITE_PROJECT_ID')?.trim() ?? '',
      apiKey: this.configService.get<string>('APPWRITE_API_KEY')?.trim() ?? '',
    };
  }

  private async markSendFailure(input: {
    tenantId: string;
    supplierRequestId: string;
    messageId: string;
    supplierId: string;
    status: SupplierMessageStatus;
    failureReason: string;
    actorId?: string | null;
  }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.supplierMessage.update({
        where: { id: input.messageId },
        data: {
          supplierId: input.supplierId,
          messageStatus: input.status,
          failureReason: input.failureReason,
        },
      });
      await tx.supplierRequest.update({
        where: { id: input.supplierRequestId },
        data: {
          status: SupplierRequestStatus.READY_TO_SEND,
          messageStatus: input.status,
        },
      });
      await tx.supplier.update({
        where: { id: input.supplierId },
        data: { messagingStatus: input.status },
      });
      await this.auditService.log(
        {
          tenantId: input.tenantId,
          actorId: input.actorId,
          action: 'SUPPLIER_MESSAGE_FAILED',
          entityType: 'SupplierRequest',
          entityId: input.supplierRequestId,
          afterJson: {
            messageId: input.messageId,
            status: input.status,
            failureReason: input.failureReason,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
    });
  }

  private resolveDraftContent(
    draft: {
      subject?: string | null;
      messageBody: string;
      messageBodyText?: string | null;
      messageBodyHtml?: string | null;
    },
    supplierRequest: SupplierRequestForMessaging,
  ): DraftContent {
    const generated = this.buildSupplierRequestDraft(supplierRequest);
    return {
      subject: draft.subject ?? generated.subject,
      text: draft.messageBodyText ?? draft.messageBody,
      html:
        draft.messageBodyHtml ??
        this.wrapEmailHtml(generated.subject, draft.messageBody),
    };
  }

  private buildSupplierRequestDraft(
    supplierRequest: SupplierRequestForMessaging,
  ): DraftContent {
    const requestNumber = supplierRequest.procurementRequest.requestNumber;
    const storeName =
      supplierRequest.procurementRequest.location?.name ??
      supplierRequest.procurementRequest.locationId;
    const subject = `Procurement Request ${requestNumber} - ${storeName}`;
    const requiredDate =
      supplierRequest.requiredDeliveryDate?.toISOString().slice(0, 10) ??
      supplierRequest.procurementRequest.requiredDate
        .toISOString()
        .slice(0, 10);
    const deliveryLocation =
      supplierRequest.deliveryLocation ??
      supplierRequest.procurementRequest.location?.name ??
      storeName;
    const itemList = supplierRequest.items
      .map((item) =>
        `- ${item.inventoryItem?.name ?? item.inventoryItemId}: ${item.requestedQuantity.toString()} ${item.inventoryItem?.defaultUom ?? ''}`.trim(),
      )
      .join('\n');
    const text = [
      `Hello ${supplierRequest.supplier.name},`,
      '',
      `We need the following items for ${storeName}:`,
      '',
      itemList,
      '',
      `Required Delivery Date: ${requiredDate}`,
      `Delivery Location: ${deliveryLocation}`,
      '',
      'Please confirm:',
      '- Availability',
      '- Best price',
      '- Delivery date/time',
      '- Payment terms',
      '',
      'You can reply to this email or contact our procurement team.',
      '',
      'Regards,',
      this.getFromName(),
    ].join('\n');
    const htmlRows = supplierRequest.items
      .map(
        (item) =>
          `<tr><td>${this.escapeHtml(item.inventoryItem?.name ?? item.inventoryItemId)}</td><td>${this.escapeHtml(item.requestedQuantity.toString())}</td><td>${this.escapeHtml(item.inventoryItem?.defaultUom ?? '')}</td></tr>`,
      )
      .join('');
    const html = this.wrapEmailHtml(
      subject,
      `<p>Hello ${this.escapeHtml(supplierRequest.supplier.name)},</p>
       <p>We need the following items for <strong>${this.escapeHtml(storeName)}</strong>:</p>
       <table><thead><tr><th>Item</th><th>Quantity</th><th>Unit</th></tr></thead><tbody>${htmlRows}</tbody></table>
       <p><strong>Required Delivery Date:</strong> ${this.escapeHtml(requiredDate)}</p>
       <p><strong>Delivery Location:</strong> ${this.escapeHtml(deliveryLocation)}</p>
       <p>Please confirm availability, best price, delivery date/time, and payment terms.</p>
       <p>You can reply to this email or contact our procurement team.</p>
       <p>Regards,<br/>${this.escapeHtml(this.getFromName())}</p>`,
    );

    return { subject, text, html };
  }

  private buildSupplierReminderDraft(
    supplierRequest: SupplierRequestForMessaging,
  ): DraftContent {
    const requestNumber = supplierRequest.procurementRequest.requestNumber;
    const itemList = supplierRequest.items
      .map((item) =>
        `- ${item.inventoryItem?.name ?? item.inventoryItemId}: ${item.requestedQuantity.toString()} ${item.inventoryItem?.defaultUom ?? ''}`.trim(),
      )
      .join('\n');
    const subject = `Reminder: Procurement Request ${requestNumber}`;
    const text = [
      `Hello ${supplierRequest.supplier.name},`,
      '',
      `This is a reminder for Procurement Request ${requestNumber}.`,
      '',
      'We are waiting for your confirmation for the requested items:',
      itemList,
      '',
      'Please confirm availability, price, and delivery date.',
      '',
      'Regards,',
      this.getFromName(),
    ].join('\n');
    const html = this.wrapEmailHtml(
      subject,
      `<p>Hello ${this.escapeHtml(supplierRequest.supplier.name)},</p>
       <p>This is a reminder for Procurement Request <strong>${this.escapeHtml(requestNumber)}</strong>.</p>
       <pre>${this.escapeHtml(itemList)}</pre>
       <p>Please confirm availability, price, and delivery date.</p>
       <p>Regards,<br/>${this.escapeHtml(this.getFromName())}</p>`,
    );

    return { subject, text, html };
  }

  private wrapEmailHtml(subject: string, bodyHtml: string) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${this.escapeHtml(subject)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #171717; line-height: 1.5; }
      .wrap { max-width: 680px; margin: 0 auto; padding: 24px; }
      .header { font-weight: 700; font-size: 18px; margin-bottom: 18px; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
      th { background: #f8fafc; }
      pre { white-space: pre-wrap; font-family: Arial, sans-serif; background: #f8fafc; padding: 12px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">${this.escapeHtml(this.getFromName())}</div>
      ${bodyHtml}
    </div>
  </body>
</html>`;
  }

  private getFromName() {
    return (
      this.configService.get<string>('SUPPLIER_MESSAGING_FROM_NAME')?.trim() ||
      'BakeStack'
    );
  }

  private internalProcurementTopicId(tenantId: string) {
    const explicit = this.configService
      .get<string>('APPWRITE_INTERNAL_PROCUREMENT_TOPIC_ID')
      ?.trim();
    if (explicit) return explicit;

    const prefix =
      this.configService
        .get<string>('APPWRITE_INTERNAL_PROCUREMENT_TOPIC_PREFIX')
        ?.trim() || '';
    return prefix ? `${prefix}${tenantId}` : undefined;
  }

  private safeErrorMessage(error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Appwrite Messaging send failed';
    return message
      .replace(/standard_[A-Za-z0-9]+/g, 'standard_[redacted]')
      .replace(/[A-Za-z0-9_-]{48,}/g, '[redacted]')
      .slice(0, 500);
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
