// SPDX-License-Identifier: Apache-2.0
export interface MeetingParticipant {
  id: string;
  email?: string;
  displayName?: string;
}

export interface MeetingSegment {
  speakerId: string;
  text: string;
  startMs: number;
}

export interface MeetingSession {
  id: string;
  title: string;
  startedAt: Date;
  participants: MeetingParticipant[];
  segments: MeetingSegment[];
}

export interface DirectUploadPayload {
  id?: string;
  title: string;
  startedAt: string;
  participants: MeetingParticipant[];
  segments: MeetingSegment[];
}

export interface VttUploadPayload {
  title: string;
  startedAt: string;
  vtt: string;
  /** Stable source meeting id; keeps the Container id deterministic across re-pulls (else a random UUID). */
  id?: string;
  /** Optional roster to attach emails to VTT-derived speakers (matched by display name). */
  participants?: MeetingParticipant[];
}
