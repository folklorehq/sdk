import { z } from 'zod';
export declare const COLLAB_DISPLAY_NAME_MAX = 80;
export declare const COLLAB_COLOR_MAX = 32;
export declare const COLLAB_CHAT_TEXT_MAX = 2000;
export declare const COLLAB_CHAT_HISTORY_MAX = 100;
export declare const AWARENESS_USER_FIELD = "user";
export declare const COLLAB_WS_PATH = "/collab";
export declare const COLLAB_DEFAULT_PORT = 1234;
export declare const MAX_TCP_PORT = 65535;
export declare const collabCursorSchema: z.ZodObject<{
    anchor: z.ZodNumber;
    head: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    anchor: number;
    head: number;
}, {
    anchor: number;
    head: number;
}>;
export type CollabCursor = z.infer<typeof collabCursorSchema>;
export declare const collabPresenceSchema: z.ZodObject<{
    userId: z.ZodString;
    displayName: z.ZodString;
    color: z.ZodString;
    cursor: z.ZodOptional<z.ZodObject<{
        anchor: z.ZodNumber;
        head: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        anchor: number;
        head: number;
    }, {
        anchor: number;
        head: number;
    }>>;
}, "strict", z.ZodTypeAny, {
    userId: string;
    displayName: string;
    color: string;
    cursor?: {
        anchor: number;
        head: number;
    } | undefined;
}, {
    userId: string;
    displayName: string;
    color: string;
    cursor?: {
        anchor: number;
        head: number;
    } | undefined;
}>;
export type CollabPresence = z.infer<typeof collabPresenceSchema>;
export declare const collabChatMessageSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    displayName: z.ZodString;
    text: z.ZodString;
    ts: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    userId: string;
    displayName: string;
    id: string;
    text: string;
    ts: number;
}, {
    userId: string;
    displayName: string;
    id: string;
    text: string;
    ts: number;
}>;
export type CollabChatMessage = z.infer<typeof collabChatMessageSchema>;
export declare const collabClientStatelessSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"chat">;
    text: z.ZodString;
    displayName: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "chat";
    displayName: string;
    text: string;
}, {
    type: "chat";
    displayName: string;
    text: string;
}>]>;
export type CollabClientStateless = z.infer<typeof collabClientStatelessSchema>;
export declare const collabServerStatelessSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"chat">;
    message: z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        displayName: z.ZodString;
        text: z.ZodString;
        ts: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        userId: string;
        displayName: string;
        id: string;
        text: string;
        ts: number;
    }, {
        userId: string;
        displayName: string;
        id: string;
        text: string;
        ts: number;
    }>;
}, "strict", z.ZodTypeAny, {
    message: {
        userId: string;
        displayName: string;
        id: string;
        text: string;
        ts: number;
    };
    type: "chat";
}, {
    message: {
        userId: string;
        displayName: string;
        id: string;
        text: string;
        ts: number;
    };
    type: "chat";
}>, z.ZodObject<{
    type: z.ZodLiteral<"chat-history">;
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        displayName: z.ZodString;
        text: z.ZodString;
        ts: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        userId: string;
        displayName: string;
        id: string;
        text: string;
        ts: number;
    }, {
        userId: string;
        displayName: string;
        id: string;
        text: string;
        ts: number;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    type: "chat-history";
    messages: {
        userId: string;
        displayName: string;
        id: string;
        text: string;
        ts: number;
    }[];
}, {
    type: "chat-history";
    messages: {
        userId: string;
        displayName: string;
        id: string;
        text: string;
        ts: number;
    }[];
}>]>;
export type CollabServerStateless = z.infer<typeof collabServerStatelessSchema>;
//# sourceMappingURL=collab.d.ts.map