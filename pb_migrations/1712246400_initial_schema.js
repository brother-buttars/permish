/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // =========================================================================
  // 1. users (Auth Collection)
  // =========================================================================
  const users = new Collection({
    type: "auth",
    name: "users",
    listRule: '@request.auth.id != "" && (@request.auth.role = "super" || id = @request.auth.id)',
    viewRule: '@request.auth.id != "" && (@request.auth.role = "super" || id = @request.auth.id)',
    createRule: "",
    updateRule: "@request.auth.id = id",
    deleteRule: '@request.auth.role = "super" && id != @request.auth.id',
    fields: [
      {
        type: "text",
        name: "name",
        required: true,
        options: { max: 200 },
      },
      {
        type: "select",
        name: "role",
        required: true,
        options: {
          values: ["super", "planner", "parent"],
          maxSelect: 1,
        },
      },
      {
        type: "text",
        name: "phone",
        options: { max: 20 },
      },
      {
        type: "text",
        name: "address",
        options: { max: 500 },
      },
      {
        type: "text",
        name: "city",
        options: { max: 100 },
      },
      {
        type: "text",
        name: "state_province",
        options: { max: 100 },
      },
      {
        type: "text",
        name: "guardian_signature",
        options: { max: 800000 },
      },
      {
        type: "select",
        name: "guardian_signature_type",
        options: {
          values: ["drawn", "typed", "hand"],
          maxSelect: 1,
        },
      },
    ],
  });
  app.save(users);

  // =========================================================================
  // 2. events (Base Collection)
  // =========================================================================
  const events = new Collection({
    type: "base",
    name: "events",
    listRule: '@request.auth.id != "" && created_by = @request.auth.id',
    viewRule: null,
    createRule:
      '@request.auth.id != "" && (@request.auth.role = "planner" || @request.auth.role = "super")',
    updateRule: '@request.auth.id != "" && created_by = @request.auth.id',
    deleteRule: '@request.auth.id != "" && created_by = @request.auth.id',
    fields: [
      {
        type: "relation",
        name: "created_by",
        required: true,
        options: {
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
      },
      {
        type: "text",
        name: "event_name",
        required: true,
        options: { max: 200 },
      },
      {
        type: "text",
        name: "event_dates",
        required: true,
        options: { max: 200 },
      },
      {
        type: "date",
        name: "event_start",
      },
      {
        type: "date",
        name: "event_end",
      },
      {
        type: "text",
        name: "event_description",
        required: true,
        options: { max: 1000 },
      },
      {
        type: "text",
        name: "ward",
        required: true,
        options: { max: 200 },
      },
      {
        type: "text",
        name: "stake",
        required: true,
        options: { max: 200 },
      },
      {
        type: "text",
        name: "leader_name",
        required: true,
        options: { max: 200 },
      },
      {
        type: "text",
        name: "leader_phone",
        required: true,
        options: { max: 20 },
      },
      {
        type: "email",
        name: "leader_email",
        required: true,
      },
      {
        type: "email",
        name: "notify_email",
      },
      {
        type: "text",
        name: "notify_phone",
        options: { max: 20 },
      },
      {
        type: "select",
        name: "notify_carrier",
        options: {
          values: [
            "att",
            "verizon",
            "tmobile",
            "uscellular",
            "cricket",
            "boost",
            "metropcs",
          ],
          maxSelect: 1,
        },
      },
      {
        type: "json",
        name: "organizations",
      },
      {
        type: "text",
        name: "additional_details",
        options: { max: 5000 },
      },
      {
        type: "bool",
        name: "is_active",
      },
    ],
  });
  app.save(events);

  // =========================================================================
  // 3. event_attachments (Base Collection)
  // =========================================================================
  const eventAttachments = new Collection({
    type: "base",
    name: "event_attachments",
    listRule: "",
    viewRule: "",
    createRule:
      '@request.auth.id != "" && (@request.auth.role = "planner" || @request.auth.role = "super")',
    updateRule: '@request.auth.id != "" && event_id.created_by = @request.auth.id',
    deleteRule: '@request.auth.id != "" && event_id.created_by = @request.auth.id',
    fields: [
      {
        type: "relation",
        name: "event_id",
        required: true,
        options: {
          collectionId: events.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
      },
      {
        type: "file",
        name: "file",
        required: true,
        options: {
          maxSize: 10485760,
          maxSelect: 1,
          mimeTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
          ],
        },
      },
      {
        type: "text",
        name: "original_name",
        required: true,
        options: { max: 500 },
      },
      {
        type: "number",
        name: "display_order",
      },
    ],
  });
  app.save(eventAttachments);

  // =========================================================================
  // 4. child_profiles (Base Collection)
  // =========================================================================
  const childProfiles = new Collection({
    type: "base",
    name: "child_profiles",
    listRule: "@request.auth.id = user_id",
    viewRule: "@request.auth.id = user_id",
    createRule:
      '@request.auth.id != "" && @request.data.user_id = @request.auth.id',
    updateRule: "@request.auth.id = user_id",
    deleteRule: "@request.auth.id = user_id",
    fields: [
      {
        type: "relation",
        name: "user_id",
        required: true,
        options: {
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
      },
      {
        type: "text",
        name: "participant_name",
        required: true,
        options: { max: 200 },
      },
      {
        type: "date",
        name: "participant_dob",
        required: true,
      },
      {
        type: "text",
        name: "participant_phone",
        options: { max: 20 },
      },
      {
        type: "text",
        name: "address",
        options: { max: 500 },
      },
      {
        type: "text",
        name: "city",
        options: { max: 100 },
      },
      {
        type: "text",
        name: "state_province",
        options: { max: 100 },
      },
      {
        type: "text",
        name: "emergency_contact",
        options: { max: 200 },
      },
      {
        type: "text",
        name: "emergency_phone_primary",
        options: { max: 20 },
      },
      {
        type: "text",
        name: "emergency_phone_secondary",
        options: { max: 20 },
      },
      {
        type: "bool",
        name: "special_diet",
      },
      {
        type: "text",
        name: "special_diet_details",
        options: { max: 500 },
      },
      {
        type: "bool",
        name: "allergies",
      },
      {
        type: "text",
        name: "allergies_details",
        options: { max: 500 },
      },
      {
        type: "text",
        name: "medications",
        options: { max: 500 },
      },
      {
        type: "bool",
        name: "can_self_administer_meds",
      },
      {
        type: "bool",
        name: "chronic_illness",
      },
      {
        type: "text",
        name: "chronic_illness_details",
        options: { max: 500 },
      },
      {
        type: "bool",
        name: "recent_surgery",
      },
      {
        type: "text",
        name: "recent_surgery_details",
        options: { max: 500 },
      },
      {
        type: "text",
        name: "activity_limitations",
        options: { max: 1000 },
      },
      {
        type: "text",
        name: "other_accommodations",
        options: { max: 1000 },
      },
      {
        type: "text",
        name: "youth_program",
        options: { max: 100 },
      },
    ],
  });
  app.save(childProfiles);

  // =========================================================================
  // 5. submissions (Base Collection)
  // =========================================================================
  const submissions = new Collection({
    type: "base",
    name: "submissions",
    listRule:
      '@request.auth.id != "" && (submitted_by = @request.auth.id || event_id.created_by = @request.auth.id)',
    viewRule:
      '@request.auth.id != "" && (submitted_by = @request.auth.id || event_id.created_by = @request.auth.id)',
    createRule: "",
    updateRule:
      '@request.auth.id != "" && (submitted_by = @request.auth.id || event_id.created_by = @request.auth.id)',
    deleteRule: '@request.auth.id != "" && event_id.created_by = @request.auth.id',
    fields: [
      {
        type: "relation",
        name: "event_id",
        required: true,
        options: {
          collectionId: events.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
      },
      {
        type: "relation",
        name: "submitted_by",
        options: {
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
      },
      {
        type: "text",
        name: "participant_name",
        required: true,
        options: { max: 200 },
      },
      {
        type: "date",
        name: "participant_dob",
        required: true,
      },
      {
        type: "number",
        name: "participant_age",
        required: true,
      },
      {
        type: "text",
        name: "participant_phone",
        options: { max: 20 },
      },
      {
        type: "text",
        name: "address",
        options: { max: 500 },
      },
      {
        type: "text",
        name: "city",
        options: { max: 100 },
      },
      {
        type: "text",
        name: "state_province",
        options: { max: 100 },
      },
      {
        type: "text",
        name: "emergency_contact",
        options: { max: 200 },
      },
      {
        type: "text",
        name: "emergency_phone_primary",
        options: { max: 20 },
      },
      {
        type: "text",
        name: "emergency_phone_secondary",
        options: { max: 20 },
      },
      {
        type: "bool",
        name: "special_diet",
      },
      {
        type: "text",
        name: "special_diet_details",
        options: { max: 500 },
      },
      {
        type: "bool",
        name: "allergies",
      },
      {
        type: "text",
        name: "allergies_details",
        options: { max: 500 },
      },
      {
        type: "text",
        name: "medications",
        options: { max: 500 },
      },
      {
        type: "bool",
        name: "can_self_administer_meds",
      },
      {
        type: "bool",
        name: "chronic_illness",
      },
      {
        type: "text",
        name: "chronic_illness_details",
        options: { max: 500 },
      },
      {
        type: "bool",
        name: "recent_surgery",
      },
      {
        type: "text",
        name: "recent_surgery_details",
        options: { max: 500 },
      },
      {
        type: "text",
        name: "activity_limitations",
        options: { max: 1000 },
      },
      {
        type: "text",
        name: "other_accommodations",
        options: { max: 1000 },
      },
      {
        type: "text",
        name: "participant_signature",
        options: { max: 800000 },
      },
      {
        type: "select",
        name: "participant_signature_type",
        required: true,
        options: {
          values: ["drawn", "typed", "hand"],
          maxSelect: 1,
        },
      },
      {
        type: "date",
        name: "participant_signature_date",
        required: true,
      },
      {
        type: "text",
        name: "guardian_signature",
        options: { max: 800000 },
      },
      {
        type: "select",
        name: "guardian_signature_type",
        options: {
          values: ["drawn", "typed", "hand"],
          maxSelect: 1,
        },
      },
      {
        type: "date",
        name: "guardian_signature_date",
      },
      {
        type: "text",
        name: "pdf_path",
        options: { max: 500 },
      },
    ],
  });
  app.save(submissions);
}, (app) => {
  // Down migration - delete in reverse dependency order
  const submissions = app.findCollectionByNameOrId("submissions");
  app.delete(submissions);

  const childProfiles = app.findCollectionByNameOrId("child_profiles");
  app.delete(childProfiles);

  const eventAttachments = app.findCollectionByNameOrId("event_attachments");
  app.delete(eventAttachments);

  const events = app.findCollectionByNameOrId("events");
  app.delete(events);

  const users = app.findCollectionByNameOrId("users");
  app.delete(users);
});
