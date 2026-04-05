/**
 * Shareable event link utilities.
 *
 * Events can be shared across Permish instances via a URL with encoded event data.
 * The receiving instance decodes the data and lets the user add it to their events.
 */

export interface ShareableEvent {
  event_name: string;
  event_dates: string;
  event_start?: string;
  event_end?: string;
  event_description: string;
  ward: string;
  stake: string;
  leader_name: string;
  leader_phone: string;
  leader_email: string;
  organizations?: string;
  additional_details?: string;
}

/**
 * Encode event data into a shareable URL.
 * Uses base64url encoding (URL-safe, no padding).
 */
export function createShareLink(event: ShareableEvent, baseUrl?: string): string {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const data: ShareableEvent = {
    event_name: event.event_name,
    event_dates: event.event_dates,
    event_start: event.event_start || undefined,
    event_end: event.event_end || undefined,
    event_description: event.event_description,
    ward: event.ward,
    stake: event.stake,
    leader_name: event.leader_name,
    leader_phone: event.leader_phone,
    leader_email: event.leader_email,
    organizations: event.organizations || '[]',
    additional_details: event.additional_details || undefined,
  };

  // Remove undefined values to keep the URL short
  const clean = JSON.parse(JSON.stringify(data));
  const json = JSON.stringify(clean);
  const encoded = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${origin}/import-event?data=${encoded}`;
}

/**
 * Decode event data from a share link's data parameter.
 */
export function decodeShareData(encoded: string): ShareableEvent {
  // Restore base64 padding and chars
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';

  const json = decodeURIComponent(escape(atob(base64)));
  const data = JSON.parse(json);

  // Validate required fields
  if (!data.event_name || !data.event_dates || !data.event_description) {
    throw new Error('Invalid event data: missing required fields');
  }

  return data as ShareableEvent;
}
