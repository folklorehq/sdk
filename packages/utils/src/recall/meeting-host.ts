// SPDX-License-Identifier: Apache-2.0
const ALLOWED_MEETING_HOST_SUFFIXES = ['zoom.us', 'teams.microsoft.com'] as const;
const ALLOWED_MEETING_HOSTS_EXACT = ['meet.google.com'] as const;

export function isAllowedRecallMeetingUrl(meetingUrl: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(meetingUrl);
  } catch {
    return false;
  }
  if (parsedUrl.protocol !== 'https:') {
    return false;
  }
  const host = parsedUrl.hostname.toLowerCase();
  return (
    ALLOWED_MEETING_HOSTS_EXACT.includes(host as (typeof ALLOWED_MEETING_HOSTS_EXACT)[number]) ||
    ALLOWED_MEETING_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  );
}
