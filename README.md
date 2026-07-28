# Folklore SDK

Open-source connector SDK and shared types for building knowledge-ingestion pipelines.

## Quick start

```bash
pnpm install
pnpm build
pnpm test
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
| `packages/inference` | Inference backend port + verified-model allowlist helpers |
| `packages/cli` | `folklore` CLI (`init`, `connector test`, `verify-attestation`) |
| `packages/recovery` | Browser-safe recovery keygen (BIP39 → X25519) |
| `packages/eslint-plugin` | ESLint rules including `no-content-in-sinks` |
| `packages/leak-guard` | Content-leak testing harness (sentinels, deep scan, recording sinks) |
| `examples/custom-connector` | Third-party connector walkthrough |
| `examples/ecies-vectors.json` | Known-answer vector for the ingest ECIES scheme |

See [docs/connectors-authoring.md](docs/connectors-authoring.md) for how to add a source.

Enclave attestation code lives in [folklorehq/enclave](https://github.com/folklorehq/enclave).

Ranking, retrieval, knowledge-graph construction, synthesis prompts, and the hosted product
remain private — this repo is the connector and trust-tooling surface only.

## License

Apache-2.0 — see [LICENSE](LICENSE).
