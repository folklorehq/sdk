# Custom connector example

A third-party `standup_bot` source that registers with `ConnectorRegistry` without patching
built-in connector registration.

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

To register in production code, call `registerStandupConnector(getDefaultConnectorRegistry())`
at process startup before handling webhooks.
