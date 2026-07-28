// SPDX-License-Identifier: Apache-2.0
import type { CypherRunner } from './cypher-runner.js';
import type { ThemeGraph } from './ports.js';

export class ThemeGraphCore implements ThemeGraph {
  constructor(private readonly cypher: CypherRunner) {}

  async linkFactToTheme(
    factId: string,
    themeId: string,
    score: number,
    orgId: string,
  ): Promise<void> {
    await this.cypher.run(
      `MERGE (f:Fact {id: $factId})
       MERGE (t:Theme {id: $themeId})
       MERGE (f)-[r:SCORED_FOR]->(t)
       SET r.score = $score, r.orgId = $orgId`,
      { factId, themeId, score, orgId },
    );
  }

  async relateThemes(
    fromThemeId: string,
    toThemeId: string,
    confidence: number,
    relationshipType: string,
    orgId: string,
  ): Promise<void> {
    await this.cypher.run(
      `MERGE (from:Theme {id: $fromThemeId})
       MERGE (to:Theme {id: $toThemeId})
       MERGE (from)-[r:RELATED_TO {relationship_type: $relationshipType}]->(to)
       SET r.confidence = $confidence, r.orgId = $orgId`,
      { fromThemeId, toThemeId, confidence, relationshipType, orgId },
    );
  }

  async setContainerGrouping(
    containerId: string,
    themeId: string,
    confidence: number,
  ): Promise<void> {
    await this.cypher.run(
      `MERGE (container:Container {id: $containerId})
       MERGE (theme:Theme {id: $themeId})
       MERGE (container)-[r:GROUPED_INTO]->(theme)
       SET r.confidence = $confidence`,
      { containerId, themeId, confidence },
    );
  }

  async getFactThemes(
    factId: string,
    orgId: string,
    limit = 10,
  ): Promise<Array<{ themeId: string; score: number }>> {
    return this.cypher.query(
      `MATCH (f:Fact {id: $factId, orgId: $orgId})-[r:SCORED_FOR]->(t:Theme)
       RETURN t.id AS themeId, r.score AS score
       ORDER BY r.score DESC
       LIMIT ${limit}`,
      ['themeId', 'score'],
      { factId, orgId },
    );
  }

  async upsertThemeNode(
    themeId: string,
    orgId: string,
    name: string,
    description?: string,
  ): Promise<void> {
    await this.cypher.run(
      `MERGE (t:Theme {id: $themeId})
       SET t.orgId = $orgId, t.name = $name, t.description = $description`,
      { themeId, orgId, name, description: description ?? null },
    );
  }

  async linkThemeToParent(
    childThemeId: string,
    parentThemeId: string,
    weight: number,
  ): Promise<void> {
    await this.cypher.run(
      `MERGE (child:Theme {id: $childThemeId})
       MERGE (parent:Theme {id: $parentThemeId})
       MERGE (child)-[r:PART_OF]->(parent)
       SET r.weight = $weight`,
      { childThemeId, parentThemeId, weight },
    );
  }

  async upsertFactNode(factId: string, orgId: string, occurredAt: Date): Promise<void> {
    await this.cypher.run(
      `MERGE (f:Fact {id: $factId})
       SET f.orgId = $orgId, f.occurredAt = $occurredAt`,
      { factId, orgId, occurredAt: occurredAt.toISOString() },
    );
  }

  async upsertContainerNode(containerId: string, orgId: string, label: string): Promise<void> {
    await this.cypher.run(
      `MERGE (c:Container {id: $containerId})
       SET c.orgId = $orgId, c.label = $label`,
      { containerId, orgId, label },
    );
  }

  async linkFactToContainer(factId: string, containerId: string): Promise<void> {
    await this.cypher.run(
      `MERGE (f:Fact {id: $factId})
       MERGE (c:Container {id: $containerId})
       MERGE (f)-[:BELONGS_TO]->(c)`,
      { factId, containerId },
    );
  }

  async getRelatedThemes(
    themeId: string,
    orgId: string,
    limit = 10,
  ): Promise<Array<{ themeId: string; similarity: number }>> {
    return this.cypher.query(
      `MATCH (t:Theme {id: $themeId})-[r:RELATED_TO]-(related:Theme {orgId: $orgId})
       RETURN related.id AS themeId, r.confidence AS similarity
       ORDER BY r.confidence DESC LIMIT ${limit}`,
      ['themeId', 'similarity'],
      { themeId, orgId },
    );
  }

  async getParentThemes(
    themeId: string,
    orgId: string,
  ): Promise<Array<{ parentThemeId: string; weight: number }>> {
    return this.cypher.query(
      `MATCH (t:Theme {id: $themeId})-[r:PART_OF]->(parent:Theme {orgId: $orgId})
       RETURN parent.id AS parentThemeId, r.weight AS weight`,
      ['parentThemeId', 'weight'],
      { themeId, orgId },
    );
  }

  async getChildThemes(
    themeId: string,
    orgId: string,
    limit = 25,
  ): Promise<Array<{ childThemeId: string; weight: number }>> {
    return this.cypher.query(
      `MATCH (child:Theme {orgId: $orgId})-[r:PART_OF]->(t:Theme {id: $themeId})
       RETURN child.id AS childThemeId, r.weight AS weight
       ORDER BY r.weight DESC LIMIT ${limit}`,
      ['childThemeId', 'weight'],
      { themeId, orgId },
    );
  }

  async getFactsForTheme(
    themeId: string,
    orgId: string,
    limit = 50,
  ): Promise<Array<{ factId: string; score: number }>> {
    return this.cypher.query(
      `MATCH (f:Fact {orgId: $orgId})-[r:SCORED_FOR]->(t:Theme {id: $themeId})
       RETURN f.id AS factId, r.score AS score
       ORDER BY r.score DESC LIMIT ${limit}`,
      ['factId', 'score'],
      { themeId, orgId },
    );
  }

  async mergeThemeEdges(loserThemeId: string, winnerThemeId: string, orgId: string): Promise<void> {
    const ids = { loserThemeId, winnerThemeId, orgId };
    await this.repointFactScores(ids);
    await this.repointContainerGroupings(ids);
    await this.repointParentEdges(ids);
    await this.repointChildEdges(ids);
    await this.repointRelatedEdges(ids);
    await this.markNodeMerged(ids);
  }

  private async repointFactScores(ids: MergeEdgeParams): Promise<void> {
    await this.cypher.run(
      `MATCH (f:Fact)-[r:SCORED_FOR]->(:Theme {id: $loserThemeId})
       MERGE (w:Theme {id: $winnerThemeId})
       MERGE (f)-[nr:SCORED_FOR]->(w)
       SET nr.score = r.score, nr.orgId = $orgId
       DELETE r`,
      ids,
    );
  }

  private async repointContainerGroupings(ids: MergeEdgeParams): Promise<void> {
    await this.cypher.run(
      `MATCH (c:Container)-[r:GROUPED_INTO]->(:Theme {id: $loserThemeId})
       MERGE (w:Theme {id: $winnerThemeId})
       MERGE (c)-[nr:GROUPED_INTO]->(w)
       SET nr.confidence = r.confidence
       DELETE r`,
      ids,
    );
  }

  private async repointParentEdges(ids: MergeEdgeParams): Promise<void> {
    await this.cypher.run(
      `MATCH (:Theme {id: $loserThemeId})-[r:PART_OF]->(parent:Theme)
       WHERE parent.id <> $winnerThemeId
       MERGE (w:Theme {id: $winnerThemeId})
       MERGE (w)-[nr:PART_OF]->(parent)
       SET nr.weight = r.weight
       DELETE r`,
      ids,
    );
  }

  private async repointChildEdges(ids: MergeEdgeParams): Promise<void> {
    await this.cypher.run(
      `MATCH (child:Theme)-[r:PART_OF]->(:Theme {id: $loserThemeId})
       WHERE child.id <> $winnerThemeId
       MERGE (w:Theme {id: $winnerThemeId})
       MERGE (child)-[nr:PART_OF]->(w)
       SET nr.weight = r.weight
       DELETE r`,
      ids,
    );
  }

  private async repointRelatedEdges(ids: MergeEdgeParams): Promise<void> {
    await this.cypher.run(
      `MATCH (:Theme {id: $loserThemeId})-[r:RELATED_TO]->(other:Theme)
       WHERE other.id <> $winnerThemeId
       MERGE (w:Theme {id: $winnerThemeId})
       MERGE (w)-[nr:RELATED_TO]->(other)
       SET nr.confidence = r.confidence, nr.orgId = $orgId,
           nr.relationship_type = r.relationship_type
       DELETE r`,
      ids,
    );
    await this.cypher.run(
      `MATCH (other:Theme)-[r:RELATED_TO]->(:Theme {id: $loserThemeId})
       WHERE other.id <> $winnerThemeId
       MERGE (w:Theme {id: $winnerThemeId})
       MERGE (other)-[nr:RELATED_TO]->(w)
       SET nr.confidence = r.confidence, nr.orgId = $orgId,
           nr.relationship_type = r.relationship_type
       DELETE r`,
      ids,
    );
  }

  private async markNodeMerged(ids: MergeEdgeParams): Promise<void> {
    await this.cypher.run(
      `MATCH (loser:Theme {id: $loserThemeId})
       SET loser.status = 'merged', loser.merged_into = $winnerThemeId`,
      ids,
    );
  }
}

interface MergeEdgeParams extends Record<string, unknown> {
  loserThemeId: string;
  winnerThemeId: string;
  orgId: string;
}
