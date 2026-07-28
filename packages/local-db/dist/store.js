// SPDX-License-Identifier: Apache-2.0
import { deterministicUuid } from '@folklore/utils';
import postgres from 'postgres';
export class LocalFactStore {
    sql;
    constructor(databaseUrl) {
        this.sql = postgres(databaseUrl, { max: 4 });
    }
    async close() {
        await this.sql.end();
    }
    async ensureOrg(orgId, name = 'local') {
        await this.sql `
      INSERT INTO local_orgs (id, name) VALUES (${orgId}::uuid, ${name})
      ON CONFLICT (id) DO NOTHING
    `;
    }
    async ensureUser(orgId, userId, displayName) {
        await this.sql `
      INSERT INTO local_users (id, org_id, display_name)
      VALUES (${userId}::uuid, ${orgId}::uuid, ${displayName})
      ON CONFLICT (id) DO NOTHING
    `;
    }
    async upsertContainer(input) {
        const id = deterministicUuid(input.orgId, input.sourceContainerId);
        await this.sql `
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
    async upsertFact(input) {
        const id = deterministicUuid(input.orgId, input.sourceFactId);
        await this.sql `
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
                await this.sql `
          INSERT INTO local_fact_containers (fact_id, container_id)
          VALUES (${id}::uuid, ${containerId}::uuid)
          ON CONFLICT DO NOTHING
        `;
            }
        }
        return id;
    }
    async upsertTheme(input) {
        const themeId = deterministicUuid(input.orgId, `theme:${input.name}`);
        await this.sql `
      INSERT INTO local_themes (id, org_id, name)
      VALUES (${themeId}::uuid, ${input.orgId}::uuid, ${input.name})
      ON CONFLICT (org_id, name) DO UPDATE SET name = EXCLUDED.name
    `;
        for (const sourceFactId of input.factSourceIds) {
            const factId = deterministicUuid(input.orgId, sourceFactId);
            await this.sql `
        INSERT INTO local_theme_facts (theme_id, fact_id)
        VALUES (${themeId}::uuid, ${factId}::uuid)
        ON CONFLICT DO NOTHING
      `;
        }
        return themeId;
    }
    async loadFactMetadata(orgId, factIds) {
        if (factIds.length === 0)
            return [];
        const rows = await this.sql `
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
    async loadFactBodies(orgId, factIds) {
        if (factIds.length === 0)
            return new Map();
        const rows = await this.sql `
      SELECT id, body FROM local_facts
      WHERE org_id = ${orgId}::uuid AND id = ANY(${factIds}::uuid[])
    `;
        return new Map(rows.map((row) => [row.id, row.body]));
    }
    async countThemes(orgId) {
        const rows = await this.sql `
      SELECT count(*)::text AS count FROM local_themes WHERE org_id = ${orgId}::uuid
    `;
        return Number(rows[0]?.count ?? 0);
    }
}
//# sourceMappingURL=store.js.map