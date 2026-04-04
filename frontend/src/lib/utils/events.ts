/**
 * Parse the organizations JSON string from an event into an array of keys.
 */
export function parseOrgs(event: any): string[] {
  if (!event?.organizations) return [];
  if (typeof event.organizations === 'string') {
    try { return JSON.parse(event.organizations); } catch { return []; }
  }
  return event.organizations;
}

/**
 * Check whether an event's dates are in the past.
 */
export function isPastEvent(event: any): boolean {
  const endStr = event.event_end || event.event_start;
  if (!endStr) return false;
  return new Date(endStr) < new Date();
}
