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
