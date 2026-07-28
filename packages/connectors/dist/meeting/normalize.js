// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
// The meeting id is the only structural entity: `title` is free-authored text (like a branch
// codename, #68) and participants are actors, so neither becomes an entity.
export function normalizeMeeting(session) {
    const containerId = `meeting:${session.id}`;
    const speakerById = new Map(session.participants.map((p) => [p.id, p]));
    return {
        containers: [{ sourceContainerId: containerId, shape: 'event', label: 'meeting_transcript' }],
        facts: session.segments.map((seg, i) => {
            const speaker = speakerById.get(seg.speakerId);
            return {
                sourceFactId: `${containerId}:segment:${i}`,
                kind: 'content',
                occurredAt: new Date(session.startedAt.getTime() + seg.startMs),
                containerRefs: [containerId],
                entities: [containerId],
                authors: [
                    {
                        sourceUserId: seg.speakerId,
                        email: speaker?.email,
                        displayName: speaker?.displayName,
                    },
                ],
                content: { body: seg.text, explicitLinks: [] },
                raw: seg,
            };
        }),
    };
}
export function normalizeDirectUpload(payload) {
    return normalizeMeeting({
        id: payload.id ?? randomUUID(),
        title: payload.title,
        startedAt: new Date(payload.startedAt),
        participants: payload.participants,
        segments: payload.segments,
    });
}
export function normalizeVttUpload(payload) {
    const segments = parseVtt(payload.vtt);
    const speakerNames = [...new Set(segments.map((s) => s.speakerId))];
    const emailByName = new Map((payload.participants ?? []).map((p) => [p.displayName ?? p.id, p.email]));
    const participants = speakerNames.map((name) => ({
        id: name,
        displayName: name,
        email: emailByName.get(name),
    }));
    return normalizeMeeting({
        id: payload.id ?? randomUUID(),
        title: payload.title,
        startedAt: new Date(payload.startedAt),
        participants,
        segments,
    });
}
function parseVtt(vtt) {
    const cues = [];
    const lines = vtt.split('\n');
    let i = 0;
    while (i < lines.length && !lines[i].includes('WEBVTT'))
        i++;
    i++;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (!line || !line.includes('-->')) {
            i++;
            continue;
        }
        const startMs = parseTimestamp(line.split('-->')[0].trim());
        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i].trim());
            i++;
        }
        const rawText = textLines.join(' ');
        const voiceMatch = rawText.match(/^<v ([^>]+)>(.*)/s);
        if (voiceMatch) {
            cues.push({ speakerId: voiceMatch[1], text: voiceMatch[2].trim(), startMs });
        }
        else if (rawText) {
            cues.push({ speakerId: 'unknown', text: rawText, startMs });
        }
    }
    return cues;
}
function parseTimestamp(ts) {
    const [timePart, msPart] = ts.split('.');
    const ms = parseInt(msPart ?? '0', 10);
    const parts = timePart.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    else if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
    }
    else {
        seconds = parts[0];
    }
    return seconds * 1000 + ms;
}
//# sourceMappingURL=normalize.js.map