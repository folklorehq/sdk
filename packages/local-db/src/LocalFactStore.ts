// SPDX-License-Identifier: Apache-2.0
import { deterministicUuid } from '@folklore/utils';
import postgres from 'postgres';

export type LocalSensitivityLevel = 'public' | 'team_scoped' | 'restricted' | 'confidential';

export interface LocalFactRecord {
  id: string;
  kind: string;
  sourceId: string;
  sourceKind: string;
  occurredAt: Date;
  sensitivityLevel: LocalSensitivityLevel;
}

export interface LocalFactInput {
  orgId: string;
  sourceFactId: string;
  kind: string;
  occurredAt: Date;
  body: string;
  sensitivityLevel?: LocalSensitivityLevel;
  sourceId?: string;
  containerSourceIds?: string[];
}

export interface LocalContainerInput {
  orgId: string;
  sourceContainerId: string;
  label: string;
}

export interface LocalThemeInput {
  orgId: string;
  name: string;
  factSourceIds: string[];
}

export class LocalFactStore {
  private readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 4 });
  }

  async close(): Promise<void> {
    await this.sql.end();
  }

  async ensureOrg(orgId: string, name = 'local'): Promise<void> {
    await this.sql`
      INSERT INTO local_orgs (id, name) VALUES (${orgId}::uuid, ${name})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async ensureUser(orgId: string, userId: string, displayName: string): Promise<void> {
    await this.sql`
      INSERT INTO local_users (id, org_id, display_name)
      VALUES (${userId}::uuid, ${orgId}::uuid, ${displayName})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async upsertContainer(input: LocalContainerInput): Promise<string> {
    const id = deterministicUuid(input.orgId, input.sourceContainerId);
    await this.sql`
      INSERT INTO local_containers (id, org_id, source_container_id, label)
      VALUES (
        ${id}::uuid,
        ${input.orgId}::uuid,
        ${input.sourceContainerId},
        ${input.label}
      )
      ON CONFLICT (org_id, source_container_id) DO UPDATE
      SET label = EXCLUDED.label
    `;
    return id;
  }

  async upsertFact(input: LocalFactInput): Promise<string> {
    const id = deterministicUuid(input.orgId, input.sourceFactId);
    await this.sql`
      INSERT INTO local_facts (
        id, org_id, source_fact_id, kind, occurred_at, body, sensitivity_level, source_id
      ) VALUES (
        ${id}::uuid,
        ${input.orgId}::uuid,
        ${input.sourceFactId},
        ${input.kind},
        ${input.occurredAt},
        ${input.body},
        ${input.sensitivityLevel ?? 'team_scoped'},
        ${input.sourceId ?? 'local'}
      )
      ON CONFLICT (org_id, source_fact_id) DO UPDATE
      SET kind = EXCLUDED.kind,
          occurred_at = EXCLUDED.occurred_at,
          body = EXCLUDED.body,
          sensitivity_level = EXCLUDED.sensitivity_level
    `;

    if (input.containerSourceIds) {
      for (const containerSourceId of input.containerSourceIds) {
        const containerId = deterministicUuid(input.orgId, containerSourceId);
        await this.sql`
          INSERT INTO local_fact_containers (fact_id, container_id)
          VALUES (${id}::uuid, ${containerId}::uuid)
          ON CONFLICT DO NOTHING
        `;
      }
    }

    return id;
  }

  async upsertTheme(input: LocalThemeInput): Promise<string> {
    const themeId = deterministicUuid(input.orgId, `theme:${input.name}`);
    await this.sql`
      INSERT INTO local_themes (id, org_id, name)
      VALUES (${themeId}::uuid, ${input.orgId}::uuid, ${input.name})
      ON CONFLICT (org_id, name) DO UPDATE SET name = EXCLUDED.name
    `;
    for (const sourceFactId of input.factSourceIds) {
      const factId = deterministicUuid(input.orgId, sourceFactId);
      await this.sql`
        INSERT INTO local_theme_facts (theme_id, fact_id)
        VALUES (${themeId}::uuid, ${factId}::uuid)
        ON CONFLICT DO NOTHING
      `;
    }
    return themeId;
  }

  async loadFactMetadata(orgId: string, factIds: string[]): Promise<LocalFactRecord[]> {
    if (factIds.length === 0) return [];
    const rows = await this.sql<
      Array<{
        id: string;
        kind: string;
        source_id: string;
        occurred_at: Date;
        sensitivity_level: LocalSensitivityLevel;
      }>
    >`
      SELECT id, kind, source_id, occurred_at, sensitivity_level
      FROM local_facts
      WHERE org_id = ${orgId}::uuid AND id = ANY(${factIds}::uuid[])
    `;
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      sourceId: row.source_id,
      sourceKind: row.source_id,
      occurredAt: row.occurred_at,
      sensitivityLevel: row.sensitivity_level,
    }));
  }

  async loadFactBodies(orgId: string, factIds: string[]): Promise<Map<string, string>> {
    if (factIds.length === 0) return new Map();
    const rows = await this.sql<Array<{ id: string; body: string }>>`
      SELECT id, body FROM local_facts
      WHERE org_id = ${orgId}::uuid AND id = ANY(${factIds}::uuid[])
    `;
    return new Map(rows.map((row) => [row.id, row.body]));
  }

  async countThemes(orgId: string): Promise<number> {
    const rows = await this.sql<Array<{ count: string }>>`
      SELECT count(*)::text AS count FROM local_themes WHERE org_id = ${orgId}::uuid
    `;
    return Number(rows[0]?.count ?? 0);
  }
}
