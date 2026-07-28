// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const ZoomRecordingFileSchema = z.object({
  id: z.string().optional(),
  file_type: z.string().optional(),
  file_extension: z.string().optional(),
  recording_type: z.string().optional(),
  download_url: z.string(),
  recording_start: z.string().optional(),
  recording_end: z.string().optional(),
});

export const ZoomRecordingObjectSchema = z.object({
  uuid: z.string(),
  id: z.number().optional(),
  topic: z.string().optional(),
  start_time: z.string().optional(),
  host_email: z.string().optional(),
  recording_files: z.array(ZoomRecordingFileSchema).default([]),
});

// Zoom signs both the one-time endpoint handshake and the recording events; the connector only
// needs the discriminating `event` plus the recording object, so unknown fields are ignored.
export const ZoomWebhookEventSchema = z.object({
  event: z.string(),
  event_ts: z.number().optional(),
  download_token: z.string().optional(),
  payload: z.object({
    account_id: z.string().optional(),
    plainToken: z.string().optional(),
    object: ZoomRecordingObjectSchema.optional(),
  }),
});

export type ZoomRecordingFile = z.infer<typeof ZoomRecordingFileSchema>;
export type ZoomRecordingObject = z.infer<typeof ZoomRecordingObjectSchema>;
export type ZoomWebhookEvent = z.infer<typeof ZoomWebhookEventSchema>;
