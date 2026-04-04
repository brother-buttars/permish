export interface PresetGroup {
  key: string;
  label: string;
  items: string[];
}

export const medicalPresets: PresetGroup[] = [
  {
    key: 'allergies',
    label: 'Common Allergies',
    items: [
      'Peanuts',
      'Tree nuts',
      'Dairy / Milk',
      'Eggs',
      'Wheat / Gluten',
      'Soy',
      'Fish / Shellfish',
      'Bee stings',
      'Penicillin',
      'Ibuprofen',
      'Latex',
      'Pollen / Seasonal',
    ],
  },
  {
    key: 'special_diet',
    label: 'Dietary Needs',
    items: [
      'Vegetarian',
      'Vegan',
      'Gluten-free',
      'Dairy-free',
      'Nut-free',
      'Kosher',
      'No pork',
      'No caffeine',
      'Diabetic diet',
    ],
  },
  {
    key: 'chronic_illness',
    label: 'Chronic Conditions',
    items: [
      'Asthma',
      'Diabetes (Type 1)',
      'Diabetes (Type 2)',
      'Epilepsy / Seizures',
      'ADHD',
      'Anxiety',
      'Depression',
      'Migraines',
      'Eczema',
      'Heart condition',
    ],
  },
];

export function getPresetItems(key: string): string[] {
  return medicalPresets.find((g) => g.key === key)?.items ?? [];
}

/**
 * Join selected presets and custom text into a single comma-separated string.
 */
export function buildMedicalString(selected: string[], customText: string): string {
  const parts: string[] = [...selected];
  const trimmed = customText.trim();
  if (trimmed) {
    parts.push(trimmed);
  }
  return parts.join(', ');
}

/**
 * Split a comma-separated value back into known presets and leftover custom text.
 */
export function parseMedicalString(
  value: string,
  presetItems: string[]
): { selected: string[]; custom: string } {
  if (!value || !value.trim()) {
    return { selected: [], custom: '' };
  }

  const parts = value.split(', ');
  const presetSet = new Set(presetItems);
  const selected: string[] = [];
  const customParts: string[] = [];

  for (const part of parts) {
    if (presetSet.has(part)) {
      selected.push(part);
    } else {
      customParts.push(part);
    }
  }

  return { selected, custom: customParts.join(', ') };
}
