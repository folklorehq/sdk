# Custom connector example

A third-party `standup_bot` source registered into a local `ConnectorRegistry` instance, for
authoring and tests. A production deployment runs only connectors built into its verified image.

## Layout

| File           | Role                                                                 |
| -------------- | -------------------------------------------------------------------- |
| `connector.ts` | `StandupConnector` — maps a standup webhook into `NormalizedRecords` |
| `register.ts`  | `registerStandupConnector()` — adds the kind to a registry instance  |
| `fixture.json` | Sample webhook payload                                               |

## Try it

```bash
pnpm --filter @folklore/connectors build
pnpm --filter @folklore/cli test
```

The CLI test suite loads this example and normalizes `fixture.json` through a fresh registry.

To use it in your own tooling, call `registerStandupConnector(registry)` on a `ConnectorRegistry`
instance you construct.
