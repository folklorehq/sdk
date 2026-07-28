# Connector authoring guide

How to add a source adapter using the Folklore connector SDK.

## Mental model

A connector translates a source's webhooks and API history into **normalized records**:

- **`NormalizedFact`** — one actor, one moment, immutable content
- **`NormalizedContainer`** — a lifecycle grouping (PR, thread, ticket)

Connectors never touch the database. They emit `{ facts, containers }` and stop.

## File layout (copy this shape)

```
packages/connectors/src/<source>/
  connector.ts       # extends BaseConnector
  client.ts          # pull API port (interface)
  <tech>-client.ts   # SDK/HTTP adapter
  normalize.ts       # pure payload → NormalizedRecords mappers
  types.ts           # minimal provider shapes
  index.ts           # re-exports
```

See `github/` and `slack/` as reference implementations.

## Core interfaces

```typescript
interface Connector {
  readonly kind: string;
  listResources(): Promise<NormalizedResource[]>;
  pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult>;
  normalizeWebhook(event: WebhookEvent): NormalizedRecords;
}
```

Register with `ConnectorRegistry`:

```typescript
registry.register({
  kind: 'my_source',
  createForWebhook: (ctx) => new MyConnector(ctx, null as unknown as MyClient),
  createForPull: (deps) => new MyConnector({ logger: deps.logger }, new MyHttpClient(deps.token)),
});
```

## Test your connector

```bash
pnpm --filter @folklore/cli exec folklore connector test \
  --kind github \
  --event-type pull_request \
  --fixture path/to/fixture.json
```

For a third-party connector, see `examples/custom-connector/`.

## Built-in reference sources

GitHub, Slack, Linear, Jira, Notion, Intercom, and meeting upload ship in this repository.
Additional sources may be added over time.

## Running locally

Use the Docker stack in `deploy/docker/` for Postgres and Redis while developing a connector.
Wire your host application to call `normalizeWebhook` or `pull` and persist the emitted records
however your deployment stores them.
