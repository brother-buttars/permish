// GENERATED FILE — do not edit.
// Source: shared/schema.ts · Regenerate: `bun run gen:schema`

export type SyncKind = 'plain' | 'bool' | 'nbool';
export interface SyncField { name: string; kind: SyncKind }
export interface SyncSpec { immutable: string[]; columns: SyncField[]; updateOnPull: boolean }

export const SYNC: Record<'events' | 'child_profiles' | 'submissions', SyncSpec> =
{
  "events": {
    "immutable": [
      "id",
      "created_by"
    ],
    "columns": [
      {
        "name": "id",
        "kind": "plain"
      },
      {
        "name": "created_by",
        "kind": "plain"
      },
      {
        "name": "group_id",
        "kind": "plain"
      },
      {
        "name": "event_name",
        "kind": "plain"
      },
      {
        "name": "event_dates",
        "kind": "plain"
      },
      {
        "name": "event_start",
        "kind": "plain"
      },
      {
        "name": "event_end",
        "kind": "plain"
      },
      {
        "name": "event_description",
        "kind": "plain"
      },
      {
        "name": "ward",
        "kind": "plain"
      },
      {
        "name": "stake",
        "kind": "plain"
      },
      {
        "name": "leader_name",
        "kind": "plain"
      },
      {
        "name": "leader_phone",
        "kind": "plain"
      },
      {
        "name": "leader_email",
        "kind": "plain"
      },
      {
        "name": "notify_email",
        "kind": "plain"
      },
      {
        "name": "notify_phone",
        "kind": "plain"
      },
      {
        "name": "notify_carrier",
        "kind": "plain"
      },
      {
        "name": "organizations",
        "kind": "plain"
      },
      {
        "name": "additional_details",
        "kind": "plain"
      },
      {
        "name": "is_active",
        "kind": "bool"
      }
    ],
    "updateOnPull": true
  },
  "child_profiles": {
    "immutable": [
      "id",
      "user_id"
    ],
    "columns": [
      {
        "name": "id",
        "kind": "plain"
      },
      {
        "name": "user_id",
        "kind": "plain"
      },
      {
        "name": "participant_name",
        "kind": "plain"
      },
      {
        "name": "participant_dob",
        "kind": "plain"
      },
      {
        "name": "participant_phone",
        "kind": "plain"
      },
      {
        "name": "address",
        "kind": "plain"
      },
      {
        "name": "city",
        "kind": "plain"
      },
      {
        "name": "state_province",
        "kind": "plain"
      },
      {
        "name": "emergency_contact",
        "kind": "plain"
      },
      {
        "name": "emergency_phone_primary",
        "kind": "plain"
      },
      {
        "name": "emergency_phone_secondary",
        "kind": "plain"
      },
      {
        "name": "special_diet",
        "kind": "bool"
      },
      {
        "name": "special_diet_details",
        "kind": "plain"
      },
      {
        "name": "allergies",
        "kind": "bool"
      },
      {
        "name": "allergies_details",
        "kind": "plain"
      },
      {
        "name": "medications",
        "kind": "plain"
      },
      {
        "name": "can_self_administer_meds",
        "kind": "nbool"
      },
      {
        "name": "chronic_illness",
        "kind": "bool"
      },
      {
        "name": "chronic_illness_details",
        "kind": "plain"
      },
      {
        "name": "recent_surgery",
        "kind": "bool"
      },
      {
        "name": "recent_surgery_details",
        "kind": "plain"
      },
      {
        "name": "activity_limitations",
        "kind": "plain"
      },
      {
        "name": "other_accommodations",
        "kind": "plain"
      },
      {
        "name": "youth_program",
        "kind": "plain"
      }
    ],
    "updateOnPull": true
  },
  "submissions": {
    "immutable": [
      "id",
      "event_id",
      "submitted_by"
    ],
    "columns": [
      {
        "name": "id",
        "kind": "plain"
      },
      {
        "name": "event_id",
        "kind": "plain"
      },
      {
        "name": "submitted_by",
        "kind": "plain"
      },
      {
        "name": "participant_name",
        "kind": "plain"
      },
      {
        "name": "participant_dob",
        "kind": "plain"
      },
      {
        "name": "participant_age",
        "kind": "plain"
      },
      {
        "name": "participant_phone",
        "kind": "plain"
      },
      {
        "name": "address",
        "kind": "plain"
      },
      {
        "name": "city",
        "kind": "plain"
      },
      {
        "name": "state_province",
        "kind": "plain"
      },
      {
        "name": "emergency_contact",
        "kind": "plain"
      },
      {
        "name": "emergency_phone_primary",
        "kind": "plain"
      },
      {
        "name": "emergency_phone_secondary",
        "kind": "plain"
      },
      {
        "name": "special_diet",
        "kind": "bool"
      },
      {
        "name": "special_diet_details",
        "kind": "plain"
      },
      {
        "name": "allergies",
        "kind": "bool"
      },
      {
        "name": "allergies_details",
        "kind": "plain"
      },
      {
        "name": "medications",
        "kind": "plain"
      },
      {
        "name": "can_self_administer_meds",
        "kind": "nbool"
      },
      {
        "name": "chronic_illness",
        "kind": "bool"
      },
      {
        "name": "chronic_illness_details",
        "kind": "plain"
      },
      {
        "name": "recent_surgery",
        "kind": "bool"
      },
      {
        "name": "recent_surgery_details",
        "kind": "plain"
      },
      {
        "name": "activity_limitations",
        "kind": "plain"
      },
      {
        "name": "other_accommodations",
        "kind": "plain"
      },
      {
        "name": "participant_signature",
        "kind": "plain"
      },
      {
        "name": "participant_signature_type",
        "kind": "plain"
      },
      {
        "name": "participant_signature_date",
        "kind": "plain"
      },
      {
        "name": "guardian_signature",
        "kind": "plain"
      },
      {
        "name": "guardian_signature_type",
        "kind": "plain"
      },
      {
        "name": "guardian_signature_date",
        "kind": "plain"
      },
      {
        "name": "pdf_path",
        "kind": "plain"
      }
    ],
    "updateOnPull": false
  }
};
