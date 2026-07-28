# Folklore SDK

Open-source connector SDK and shared types for building knowledge-ingestion pipelines.

## Quick start

```bash
pnpm install
pnpm build
pnpm test
docker compose -f deploy/docker/docker-compose.yml up -d   # optional local Postgres + Redis
```

## Layout

| Path | Role |
| ---- | ---- |
| `packages/core` | Behavioral ports (`Logger`, `Cache`, `Closable`) |
| `packages/logger` | `PinoLogger` adapter for connector tests and local dev |
| `packages/errors` | `AppError` taxonomy |
| `packages/utils` | Pure helpers (hashing, vector math) |
| `packages/contracts` | Zod wire DTOs |
| `packages/connectors` | Connector SDK + reference sources (GitHub, Slack, Linear, Jira, Notion, Intercom, meeting) |
| `packages/retrieval` | Fact retrieval ports + local reference retriever |
| `packages/local-db` | Trimmed Postgres schema for local `folklore ingest` / `query` |
| `packages/inference` | Inference backend port, stub + OpenAI-compat adapters |
| `packages/graph` | `ThemeGraph` port + `LocalThemeGraph` (Apache AGE via plain Postgres) |
| `packages/cli` | `folklore` developer CLI (`init`, `ingest`, `query`, `connector test`, `verify-attestation`) |
| `examples/custom-connector` | Third-party connector walkthrough |
| `examples/corpus.json` | Sample normalized corpus for local ingest/query |

See [docs/connectors-authoring.md](docs/connectors-authoring.md) for how to add a source.

Enclave attestation code lives in [folklorehq/enclave](https://github.com/folklorehq/enclave).

## License

Apache-2.0 — see [LICENSE](LICENSE).
