// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
// box↔api real-time collab wire contract (CollabServer, Hocuspocus/Yjs). Presence rides Yjs
// awareness; ephemeral chat rides Hocuspocus stateless messages. Both are relayed only among
// connections that already passed the per-connection content gate (#169). Presence is content-free
// by construction (`.strict()` — identity/UI metadata only, never document content); chat text is
// user content but is session-only and NEVER persisted (relayed over the same TLS'd authed WS).
//
// IDENTITY IS `userId` ONLY. `displayName` and `color` are UNTRUSTED client-supplied UI metadata:
// the box session token carries no display name, so the server cannot stamp one authoritatively. A
// peer's rendered name/color is cosmetic and spoofable; never authorize, key, or attribute on it —
// the server stamps `userId` from the authed connection for identity.
export const COLLAB_DISPLAY_NAME_MAX = 80;
export const COLLAB_COLOR_MAX = 32;
export const COLLAB_CHAT_TEXT_MAX = 2000;
export const COLLAB_CHAT_HISTORY_MAX = 100;
// The Yjs awareness state field both peers carry identity/presence under. Shared so the box (which
// stamps it) and the enclave collab server (which decodes + anti-spoofs it) never drift on the key.
export const AWARENESS_USER_FIELD = 'user';
// The path the box opens its collab socket on and the enclave relays upgrades from. Shared for the
// same anti-drift reason: a mismatch here fails silently, degrading the editor to local-only.
export const COLLAB_WS_PATH = '/collab';
// Default port for the loopback collab WS. The binder (`apps/api` env) owns the live value; the
// enclave's upgrade proxy takes it from there rather than re-deriving it.
export const COLLAB_DEFAULT_PORT = 1234;
export const MAX_TCP_PORT = 65535;
// `cursor` is a caret range (relative doc offsets ≥ 0), not content.
export const collabCursorSchema = z
    .object({ anchor: z.number().int().min(0), head: z.number().int().min(0) })
    .strict();
export const collabPresenceSchema = z
    .object({
    userId: z.string().min(1),
    displayName: z.string().min(1).max(COLLAB_DISPLAY_NAME_MAX),
    color: z.string().min(1).max(COLLAB_COLOR_MAX),
    cursor: collabCursorSchema.optional(),
})
    .strict();
// `userId`/`id`/`ts` are server-stamped (authed connection + server clock, never the client);
// `displayName` is UNTRUSTED UI metadata (see header). Session-only; never written to any store.
export const collabChatMessageSchema = z
    .object({
    id: z.string(),
    userId: z.string(),
    displayName: z.string().min(1).max(COLLAB_DISPLAY_NAME_MAX),
    text: z.string().min(1).max(COLLAB_CHAT_TEXT_MAX),
    ts: z.number().int().min(0),
})
    .strict();
// Client → server stateless payload. The client supplies only text + its UNTRUSTED display name;
// the server derives the sender identity (`userId`) from the connection's authed context.
export const collabClientStatelessSchema = z.discriminatedUnion('type', [
    z
        .object({
        type: z.literal('chat'),
        text: z.string().min(1).max(COLLAB_CHAT_TEXT_MAX),
        displayName: z.string().min(1).max(COLLAB_DISPLAY_NAME_MAX),
    })
        .strict(),
]);
// Server → clients stateless payload: a freshly broadcast message, or the bounded recent-history
// replay a late joiner receives on connect (both purely in-memory, session-scoped).
export const collabServerStatelessSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('chat'), message: collabChatMessageSchema }).strict(),
    z
        .object({ type: z.literal('chat-history'), messages: z.array(collabChatMessageSchema) })
        .strict(),
]);
//# sourceMappingURL=collab.js.map