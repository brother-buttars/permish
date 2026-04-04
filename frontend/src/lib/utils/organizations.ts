export interface OrgGroup {
  key: string;
  label: string;
  children: { key: string; label: string }[];
}

export const orgGroups: OrgGroup[] = [
  {
    key: 'young_men',
    label: 'Young Men',
    children: [
      { key: 'deacons', label: 'Deacons' },
      { key: 'teachers', label: 'Teachers' },
      { key: 'priests', label: 'Priests' },
    ],
  },
  {
    key: 'young_women',
    label: 'Young Women',
    children: [
      { key: 'beehives', label: 'Beehives' },
      { key: 'mia_maids', label: 'Mia Maids' },
      { key: 'laurels', label: 'Laurels' },
    ],
  },
];

// All possible org keys
export const allOrgKeys = orgGroups.flatMap(g => g.children.map(c => c.key));

// Get display labels for a set of org keys
// If all children of a group are selected, show only the parent label
export function getOrgDisplayLabels(keys: string[]): string[] {
  const labels: string[] = [];
  for (const group of orgGroups) {
    const childKeys = group.children.map(c => c.key);
    const allSelected = childKeys.every(k => keys.includes(k));
    if (allSelected) {
      labels.push(group.label);
    } else {
      for (const child of group.children) {
        if (keys.includes(child.key)) {
          labels.push(child.label);
        }
      }
    }
  }
  return labels;
}

// Determine if an org label belongs to Young Men or Young Women family
export function isYMLabel(label: string): boolean {
  return ['Young Men', 'Deacons', 'Teachers', 'Priests'].includes(label);
}

export function isYWLabel(label: string): boolean {
  return ['Young Women', 'Beehives', 'Mia Maids', 'Laurels'].includes(label);
}

// Badge CSS classes matching YouthIcon colors (blue for YM, pink for YW)
export function orgBadgeClass(label: string): string {
  if (isYMLabel(label)) return 'border-blue-300 bg-blue-100 text-blue-600 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  if (isYWLabel(label)) return 'border-pink-300 bg-pink-100 text-pink-600 dark:border-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
  return 'border-border bg-muted text-muted-foreground';
}

// Infer youth program from org keys (for icon coloring)
// Returns 'young_men' if only YM orgs, 'young_women' if only YW orgs, null if mixed/empty
export function inferProgramFromOrgs(orgKeys: string[]): 'young_men' | 'young_women' | null {
  if (!orgKeys || orgKeys.length === 0) return null;
  const ymKeys = new Set(['deacons', 'teachers', 'priests']);
  const ywKeys = new Set(['beehives', 'mia_maids', 'laurels']);
  let hasYM = false;
  let hasYW = false;
  for (const k of orgKeys) {
    if (k === 'young_men' || ymKeys.has(k)) hasYM = true;
    if (k === 'young_women' || ywKeys.has(k)) hasYW = true;
  }
  if (hasYM && !hasYW) return 'young_men';
  if (hasYW && !hasYM) return 'young_women';
  return null;
}

// Check if org keys match a filter (any overlap)
export function matchesOrgFilter(eventOrgs: string[], filterOrgs: string[]): boolean {
  if (filterOrgs.length === 0) return true;
  // Expand parent group filters to include children
  const expanded = new Set<string>();
  for (const f of filterOrgs) {
    const group = orgGroups.find(g => g.key === f);
    if (group) {
      group.children.forEach(c => expanded.add(c.key));
    } else {
      expanded.add(f);
    }
  }
  return eventOrgs.some(o => expanded.has(o));
}
