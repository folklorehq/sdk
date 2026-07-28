import { z } from 'zod';
export declare const previewRequestSchema: z.ZodObject<{
    url: z.ZodString;
}, "strict", z.ZodTypeAny, {
    url: string;
}, {
    url: string;
}>;
export type PreviewRequest = z.infer<typeof previewRequestSchema>;
export declare const linkPreviewSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    imageUrl: z.ZodOptional<z.ZodString>;
    faviconUrl: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    title?: string | undefined;
    description?: string | undefined;
    imageUrl?: string | undefined;
    faviconUrl?: string | undefined;
}, {
    title?: string | undefined;
    description?: string | undefined;
    imageUrl?: string | undefined;
    faviconUrl?: string | undefined;
}>;
export type LinkPreview = z.infer<typeof linkPreviewSchema>;
export declare const previewResponseSchema: z.ZodObject<{
    preview: z.ZodNullable<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        imageUrl: z.ZodOptional<z.ZodString>;
        faviconUrl: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        title?: string | undefined;
        description?: string | undefined;
        imageUrl?: string | undefined;
        faviconUrl?: string | undefined;
    }, {
        title?: string | undefined;
        description?: string | undefined;
        imageUrl?: string | undefined;
        faviconUrl?: string | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    preview: {
        title?: string | undefined;
        description?: string | undefined;
        imageUrl?: string | undefined;
        faviconUrl?: string | undefined;
    } | null;
}, {
    preview: {
        title?: string | undefined;
        description?: string | undefined;
        imageUrl?: string | undefined;
        faviconUrl?: string | undefined;
    } | null;
}>;
export type PreviewResponse = z.infer<typeof previewResponseSchema>;
export declare const PREVIEW_TITLE_MAX = 300;
export declare const PREVIEW_DESCRIPTION_MAX = 1000;
//# sourceMappingURL=preview.d.ts.map