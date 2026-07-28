# Contributing

Thanks for your interest in contributing to Folklore.

## Setup

Fork this repository, then:

```bash
pnpm install
pnpm build
pnpm test
```

See [docs/connectors-authoring.md](docs/connectors-authoring.md) for building a custom connector.

## Pull requests

1. Open an issue first if the change is large or the approach is unclear.
2. Keep each PR focused on one logical change.
3. Run `pnpm build && pnpm test` before opening.

## What we welcome

- Connector SDK improvements and reference connectors
- Bug fixes in published packages
- Documentation, examples, and tests

Please do not submit credentials, AWS account identifiers, internal hostnames, or hosted-service
infrastructure configs.

## Attestation code

Trust-boundary and enclave attestation code lives in
[folklorehq/enclave](https://github.com/folklorehq/enclave). Send attestation-related changes there.

## License

By contributing, you agree your contributions are licensed under Apache-2.0, the same license as
this project.
