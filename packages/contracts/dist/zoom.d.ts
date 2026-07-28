import { z } from 'zod';
export declare const ZoomRecordingFileSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    file_type: z.ZodOptional<z.ZodString>;
    file_extension: z.ZodOptional<z.ZodString>;
    recording_type: z.ZodOptional<z.ZodString>;
    download_url: z.ZodString;
    recording_start: z.ZodOptional<z.ZodString>;
    recording_end: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    download_url: string;
    id?: string | undefined;
    file_type?: string | undefined;
    file_extension?: string | undefined;
    recording_type?: string | undefined;
    recording_start?: string | undefined;
    recording_end?: string | undefined;
}, {
    download_url: string;
    id?: string | undefined;
    file_type?: string | undefined;
    file_extension?: string | undefined;
    recording_type?: string | undefined;
    recording_start?: string | undefined;
    recording_end?: string | undefined;
}>;
export declare const ZoomRecordingObjectSchema: z.ZodObject<{
    uuid: z.ZodString;
    id: z.ZodOptional<z.ZodNumber>;
    topic: z.ZodOptional<z.ZodString>;
    start_time: z.ZodOptional<z.ZodString>;
    host_email: z.ZodOptional<z.ZodString>;
    recording_files: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        file_type: z.ZodOptional<z.ZodString>;
        file_extension: z.ZodOptional<z.ZodString>;
        recording_type: z.ZodOptional<z.ZodString>;
        download_url: z.ZodString;
        recording_start: z.ZodOptional<z.ZodString>;
        recording_end: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        download_url: string;
        id?: string | undefined;
        file_type?: string | undefined;
        file_extension?: string | undefined;
        recording_type?: string | undefined;
        recording_start?: string | undefined;
        recording_end?: string | undefined;
    }, {
        download_url: string;
        id?: string | undefined;
        file_type?: string | undefined;
        file_extension?: string | undefined;
        recording_type?: string | undefined;
        recording_start?: string | undefined;
        recording_end?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    uuid: string;
    recording_files: {
        download_url: string;
        id?: string | undefined;
        file_type?: string | undefined;
        file_extension?: string | undefined;
        recording_type?: string | undefined;
        recording_start?: string | undefined;
        recording_end?: string | undefined;
    }[];
    id?: number | undefined;
    topic?: string | undefined;
    start_time?: string | undefined;
    host_email?: string | undefined;
}, {
    uuid: string;
    id?: number | undefined;
    topic?: string | undefined;
    start_time?: string | undefined;
    host_email?: string | undefined;
    recording_files?: {
        download_url: string;
        id?: string | undefined;
        file_type?: string | undefined;
        file_extension?: string | undefined;
        recording_type?: string | undefined;
        recording_start?: string | undefined;
        recording_end?: string | undefined;
    }[] | undefined;
}>;
export declare const ZoomWebhookEventSchema: z.ZodObject<{
    event: z.ZodString;
    event_ts: z.ZodOptional<z.ZodNumber>;
    download_token: z.ZodOptional<z.ZodString>;
    payload: z.ZodObject<{
        account_id: z.ZodOptional<z.ZodString>;
        plainToken: z.ZodOptional<z.ZodString>;
        object: z.ZodOptional<z.ZodObject<{
            uuid: z.ZodString;
            id: z.ZodOptional<z.ZodNumber>;
            topic: z.ZodOptional<z.ZodString>;
            start_time: z.ZodOptional<z.ZodString>;
            host_email: z.ZodOptional<z.ZodString>;
            recording_files: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodOptional<z.ZodString>;
                file_type: z.ZodOptional<z.ZodString>;
                file_extension: z.ZodOptional<z.ZodString>;
                recording_type: z.ZodOptional<z.ZodString>;
                download_url: z.ZodString;
                recording_start: z.ZodOptional<z.ZodString>;
                recording_end: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                download_url: string;
                id?: string | undefined;
                file_type?: string | undefined;
                file_extension?: string | undefined;
                recording_type?: string | undefined;
                recording_start?: string | undefined;
                recording_end?: string | undefined;
            }, {
                download_url: string;
                id?: string | undefined;
                file_type?: string | undefined;
                file_extension?: string | undefined;
                recording_type?: string | undefined;
                recording_start?: string | undefined;
                recording_end?: string | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            uuid: string;
            recording_files: {
                download_url: string;
                id?: string | undefined;
                file_type?: string | undefined;
                file_extension?: string | undefined;
                recording_type?: string | undefined;
                recording_start?: string | undefined;
                recording_end?: string | undefined;
            }[];
            id?: number | undefined;
            topic?: string | undefined;
            start_time?: string | undefined;
            host_email?: string | undefined;
        }, {
            uuid: string;
            id?: number | undefined;
            topic?: string | undefined;
            start_time?: string | undefined;
            host_email?: string | undefined;
            recording_files?: {
                download_url: string;
                id?: string | undefined;
                file_type?: string | undefined;
                file_extension?: string | undefined;
                recording_type?: string | undefined;
                recording_start?: string | undefined;
                recording_end?: string | undefined;
            }[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        object?: {
            uuid: string;
            recording_files: {
                download_url: string;
                id?: string | undefined;
                file_type?: string | undefined;
                file_extension?: string | undefined;
                recording_type?: string | undefined;
                recording_start?: string | undefined;
                recording_end?: string | undefined;
            }[];
            id?: number | undefined;
            topic?: string | undefined;
            start_time?: string | undefined;
            host_email?: string | undefined;
        } | undefined;
        account_id?: string | undefined;
        plainToken?: string | undefined;
    }, {
        object?: {
            uuid: string;
            id?: number | undefined;
            topic?: string | undefined;
            start_time?: string | undefined;
            host_email?: string | undefined;
            recording_files?: {
                download_url: string;
                id?: string | undefined;
                file_type?: string | undefined;
                file_extension?: string | undefined;
                recording_type?: string | undefined;
                recording_start?: string | undefined;
                recording_end?: string | undefined;
            }[] | undefined;
        } | undefined;
        account_id?: string | undefined;
        plainToken?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    event: string;
    payload: {
        object?: {
            uuid: string;
            recording_files: {
                download_url: string;
                id?: string | undefined;
                file_type?: string | undefined;
                file_extension?: string | undefined;
                recording_type?: string | undefined;
                recording_start?: string | undefined;
                recording_end?: string | undefined;
            }[];
            id?: number | undefined;
            topic?: string | undefined;
            start_time?: string | undefined;
            host_email?: string | undefined;
        } | undefined;
        account_id?: string | undefined;
        plainToken?: string | undefined;
    };
    event_ts?: number | undefined;
    download_token?: string | undefined;
}, {
    event: string;
    payload: {
        object?: {
            uuid: string;
            id?: number | undefined;
            topic?: string | undefined;
            start_time?: string | undefined;
            host_email?: string | undefined;
            recording_files?: {
                download_url: string;
                id?: string | undefined;
                file_type?: string | undefined;
                file_extension?: string | undefined;
                recording_type?: string | undefined;
                recording_start?: string | undefined;
                recording_end?: string | undefined;
            }[] | undefined;
        } | undefined;
        account_id?: string | undefined;
        plainToken?: string | undefined;
    };
    event_ts?: number | undefined;
    download_token?: string | undefined;
}>;
export type ZoomRecordingFile = z.infer<typeof ZoomRecordingFileSchema>;
export type ZoomRecordingObject = z.infer<typeof ZoomRecordingObjectSchema>;
export type ZoomWebhookEvent = z.infer<typeof ZoomWebhookEventSchema>;
//# sourceMappingURL=zoom.d.ts.map