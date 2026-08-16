# Inference trust review rules

- Trust identity must come from verifier-produced evidence or signed policy, never CLI flags, environment fallbacks, caller metadata, provider response claims, or recomputable self-attestation alone.
- Bind organization, deployment, boot epoch, policy and activation generations, policy and checkpoint digests, role, exact model and revision, immutable model artifact, session, keyset, route, channel, request, response, nonce, and expiry wherever the protocol requires them.
- Recompute canonical digests independently and reject unknown fields, unsafe integers, malformed identifiers, duplicate roles, duplicate models, mismatched namespaces, stale generations, and incomparable scorecards.
- Trusted time is mandatory for security decisions. Do not fall back to `Date.now()`, host time, provider timestamps, or optional authority injection.
- Check time and lease validity immediately before irreversible writes and immediately before releasing verified responses, including across asynchronous waits.
- Require focused mutation tests for every signed or canonical field and representative end-to-end tests across public ports.
