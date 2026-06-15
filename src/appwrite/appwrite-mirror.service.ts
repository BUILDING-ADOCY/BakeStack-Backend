import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, TablesDB } from 'node-appwrite';
import {
  AppwriteOperationalTable,
  resolveAppwriteTableId,
} from './appwrite-table-ids';

export interface AppwriteMirrorRow {
  id: string;
  tenantId: string;
  locationId?: string | null;
  status?: string | null;
  name?: string | null;
  code?: string | null;
  createdById?: string | null;
  updatedById?: string | null;
  countryCode?: string | null;
  currencyCode?: string | null;
  data: unknown;
}

interface AppwriteMirrorConfig {
  endpoint: string;
  projectId: string;
  apiKey: string;
  databaseId: string;
}

@Injectable()
export class AppwriteMirrorService {
  private readonly logger = new Logger(AppwriteMirrorService.name);
  private tables: TablesDB | null = null;
  private warnedDisabled = false;

  constructor(private readonly configService: ConfigService) {}

  async upsertOperationalRow(
    table: AppwriteOperationalTable,
    row: AppwriteMirrorRow,
  ) {
    const tables = this.getTables();
    if (!tables) {
      return { skipped: true };
    }

    const config = this.readConfig();
    const tableId = resolveAppwriteTableId(this.configService, table);

    try {
      await tables.upsertRow({
        databaseId: config.databaseId,
        tableId,
        rowId: row.id,
        data: this.toAppwriteData(row),
      });
      return { skipped: false };
    } catch (error) {
      this.logger.warn(
        `Appwrite mirror upsert failed for ${table}.${row.id}: ${this.errorMessage(error)}`,
      );
      return { skipped: true, error };
    }
  }

  async deleteOperationalRow(table: AppwriteOperationalTable, id: string) {
    const tables = this.getTables();
    if (!tables) {
      return { skipped: true };
    }

    const config = this.readConfig();
    const tableId = resolveAppwriteTableId(this.configService, table);

    try {
      await tables.deleteRow({
        databaseId: config.databaseId,
        tableId,
        rowId: id,
      });
      return { skipped: false };
    } catch (error) {
      if (this.errorStatus(error) === 404) {
        return { skipped: false };
      }

      this.logger.warn(
        `Appwrite mirror delete failed for ${table}.${id}: ${this.errorMessage(error)}`,
      );
      return { skipped: true, error };
    }
  }

  private getTables() {
    const config = this.readConfig();
    if (!config.endpoint || !config.projectId || !config.apiKey) {
      this.warnDisabled(config);
      return null;
    }

    if (!this.tables) {
      const client = new Client()
        .setEndpoint(config.endpoint)
        .setProject(config.projectId)
        .setKey(config.apiKey);
      this.tables = new TablesDB(client);
    }

    return this.tables;
  }

  private readConfig(): AppwriteMirrorConfig {
    return {
      endpoint: this.configService.get<string>('APPWRITE_ENDPOINT')?.trim() ?? '',
      projectId:
        this.configService.get<string>('APPWRITE_PROJECT_ID')?.trim() ?? '',
      apiKey: this.configService.get<string>('APPWRITE_API_KEY')?.trim() ?? '',
      databaseId:
        this.configService.get<string>('APPWRITE_DATABASE_ID')?.trim() ??
        'bakestack',
    };
  }

  private warnDisabled(config: AppwriteMirrorConfig) {
    if (
      this.warnedDisabled ||
      (!config.endpoint && !config.projectId && !config.apiKey)
    ) {
      return;
    }

    const missing = [
      ['APPWRITE_ENDPOINT', config.endpoint],
      ['APPWRITE_PROJECT_ID', config.projectId],
      ['APPWRITE_API_KEY', config.apiKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    this.warnedDisabled = true;
    this.logger.warn(
      `Appwrite operational mirror disabled; missing ${missing.join(
        ', ',
      )}. PostgreSQL writes will still succeed, but mirrored rows will not appear in Appwrite TablesDB.`,
    );
  }

  private toAppwriteData(row: AppwriteMirrorRow) {
    return {
      tenantId: row.tenantId,
      createdById: row.createdById ?? null,
      updatedById: row.updatedById ?? null,
      locationId: row.locationId ?? null,
      status: this.truncate(row.status, 48),
      name: this.truncate(row.name, 160),
      code: this.truncate(row.code, 80),
      ...(row.countryCode ? { countryCode: row.countryCode } : {}),
      ...(row.currencyCode ? { currencyCode: row.currencyCode } : {}),
      data: this.stringify(row.data),
    };
  }

  private stringify(value: unknown) {
    return JSON.stringify(value, (_key, nestedValue) => {
      if (typeof nestedValue === 'bigint') {
        return nestedValue.toString();
      }

      if (
        nestedValue &&
        typeof nestedValue === 'object' &&
        'toString' in nestedValue &&
        nestedValue.constructor?.name === 'Decimal'
      ) {
        return nestedValue.toString();
      }

      return nestedValue;
    });
  }

  private truncate(value: string | null | undefined, max: number) {
    const text = value?.trim();
    if (!text) {
      return null;
    }

    return text.length > max ? text.slice(0, max) : text;
  }

  private errorStatus(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      return Number((error as { code?: unknown }).code);
    }

    return undefined;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
