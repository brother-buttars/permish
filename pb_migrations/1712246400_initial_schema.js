/// <reference path="../pb_data/types.d.ts" />

/**
 * Helper to add multiple fields to a collection via addMarshaledJSON.
 * PocketBase v0.27 requires this approach instead of new Field() in constructors.
 */
function addFields(collection, fields) {
  for (const field of fields) {
    collection.fields.addMarshaledJSON(JSON.stringify(field));
  }
}

migrate((app) => {
  // =========================================================================
  // 1. users (Auth Collection - already exists in PB v0.27, add custom fields)
  // =========================================================================
  const users = app.findCollectionByNameOrId("users");

  addFields(users, [
    {
      type: "select",
      name: "role",
      required: true,
      values: ["super", "planner", "parent"],
      maxSelect: 1,
    },
    { type: "text", name: "phone", max: 20 },
    { type: "text", name: "address", max: 500 },
    { type: "text", name: "city", max: 100 },
    { type: "text", name: "state_province", max: 100 },
    { type: "text", name: "guardian_signature", max: 800000 },
    {
      type: "select",
      name: "guardian_signature_type",
      values: ["drawn", "typed", "hand"],
      maxSelect: 1,
    },
  ]);

  users.listRule = '@request.auth.id != "" && (@request.auth.role = "super" || id = @request.auth.id)';
  users.viewRule = '@request.auth.id != "" && (@request.auth.role = "super" || id = @request.auth.id)';
  users.createRule = "";
  users.updateRule = "@request.auth.id = id";
  users.deleteRule = '@request.auth.role = "super" && id != @request.auth.id';

  app.save(users);

  // =========================================================================
  // 2. events (Base Collection)
  // =========================================================================
  const events = new Collection({ type: "base", name: "events" });

  addFields(events, [
    {
      type: "relation",
      name: "created_by",
      required: true,
      collectionId: users.id,
      cascadeDelete: false,
      maxSelect: 1,
    },
    { type: "text", name: "event_name", required: true, max: 200 },
    { type: "text", name: "event_dates", required: true, max: 200 },
    { type: "date", name: "event_start" },
    { type: "date", name: "event_end" },
    { type: "text", name: "event_description", required: true, max: 1000 },
    { type: "text", name: "ward", required: true, max: 200 },
    { type: "text", name: "stake", required: true, max: 200 },
    { type: "text", name: "leader_name", required: true, max: 200 },
    { type: "text", name: "leader_phone", required: true, max: 20 },
    { type: "email", name: "leader_email", required: true },
    { type: "email", name: "notify_email" },
    { type: "text", name: "notify_phone", max: 20 },
    {
      type: "select",
      name: "notify_carrier",
      values: ["att", "verizon", "tmobile", "uscellular", "cricket", "boost", "metropcs"],
      maxSelect: 1,
    },
    { type: "json", name: "organizations" },
    { type: "text", name: "additional_details", max: 5000 },
    { type: "bool", name: "is_active" },
  ]);

  // Save fields first (rules reference fields, so save without rules first)
  app.save(events);

  // Now apply rules that reference the created_by field
  events.listRule = '@request.auth.id != "" && created_by = @request.auth.id';
  events.viewRule = "";
  events.createRule = '@request.auth.id != "" && (@request.auth.role = "planner" || @request.auth.role = "super")';
  events.updateRule = '@request.auth.id != "" && created_by = @request.auth.id';
  events.deleteRule = '@request.auth.id != "" && created_by = @request.auth.id';
  app.save(events);

  // =========================================================================
  // 3. event_attachments (Base Collection)
  // =========================================================================
  const eventAttachments = new Collection({ type: "base", name: "event_attachments" });

  addFields(eventAttachments, [
    {
      type: "relation",
      name: "event_id",
      required: true,
      collectionId: events.id,
      cascadeDelete: true,
      maxSelect: 1,
    },
    {
      type: "file",
      name: "file",
      required: true,
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
    { type: "text", name: "original_name", required: true, max: 500 },
    { type: "number", name: "display_order" },
  ]);

  // Save fields first
  app.save(eventAttachments);

  // Apply rules (event_id.created_by requires relation to exist)
  eventAttachments.listRule = "";
  eventAttachments.viewRule = "";
  eventAttachments.createRule = '@request.auth.id != "" && (@request.auth.role = "planner" || @request.auth.role = "super")';
  eventAttachments.updateRule = '@request.auth.id != "" && event_id.created_by = @request.auth.id';
  eventAttachments.deleteRule = '@request.auth.id != "" && event_id.created_by = @request.auth.id';
  app.save(eventAttachments);

  // =========================================================================
  // 4. child_profiles (Base Collection)
  // =========================================================================
  const childProfiles = new Collection({ type: "base", name: "child_profiles" });

  addFields(childProfiles, [
    {
      type: "relation",
      name: "user_id",
      required: true,
      collectionId: users.id,
      cascadeDelete: true,
      maxSelect: 1,
    },
    { type: "text", name: "participant_name", required: true, max: 200 },
    { type: "date", name: "participant_dob", required: true },
    { type: "text", name: "participant_phone", max: 20 },
    { type: "text", name: "address", max: 500 },
    { type: "text", name: "city", max: 100 },
    { type: "text", name: "state_province", max: 100 },
    { type: "text", name: "emergency_contact", max: 200 },
    { type: "text", name: "emergency_phone_primary", max: 20 },
    { type: "text", name: "emergency_phone_secondary", max: 20 },
    { type: "bool", name: "special_diet" },
    { type: "text", name: "special_diet_details", max: 500 },
    { type: "bool", name: "allergies" },
    { type: "text", name: "allergies_details", max: 500 },
    { type: "text", name: "medications", max: 500 },
    { type: "bool", name: "can_self_administer_meds" },
    { type: "bool", name: "chronic_illness" },
    { type: "text", name: "chronic_illness_details", max: 500 },
    { type: "bool", name: "recent_surgery" },
    { type: "text", name: "recent_surgery_details", max: 500 },
    { type: "text", name: "activity_limitations", max: 1000 },
    { type: "text", name: "other_accommodations", max: 1000 },
    { type: "text", name: "youth_program", max: 100 },
  ]);

  app.save(childProfiles);

  childProfiles.listRule = "@request.auth.id = user_id";
  childProfiles.viewRule = "@request.auth.id = user_id";
  childProfiles.createRule = '@request.auth.id != "" && @request.body.user_id = @request.auth.id';
  childProfiles.updateRule = "@request.auth.id = user_id";
  childProfiles.deleteRule = "@request.auth.id = user_id";
  app.save(childProfiles);

  // =========================================================================
  // 5. submissions (Base Collection)
  // =========================================================================
  const submissions = new Collection({ type: "base", name: "submissions" });

  addFields(submissions, [
    {
      type: "relation",
      name: "event_id",
      required: true,
      collectionId: events.id,
      cascadeDelete: false,
      maxSelect: 1,
    },
    {
      type: "relation",
      name: "submitted_by",
      collectionId: users.id,
      cascadeDelete: false,
      maxSelect: 1,
    },
    { type: "text", name: "participant_name", required: true, max: 200 },
    { type: "date", name: "participant_dob", required: true },
    { type: "number", name: "participant_age", required: true },
    { type: "text", name: "participant_phone", max: 20 },
    { type: "text", name: "address", max: 500 },
    { type: "text", name: "city", max: 100 },
    { type: "text", name: "state_province", max: 100 },
    { type: "text", name: "emergency_contact", max: 200 },
    { type: "text", name: "emergency_phone_primary", max: 20 },
    { type: "text", name: "emergency_phone_secondary", max: 20 },
    { type: "bool", name: "special_diet" },
    { type: "text", name: "special_diet_details", max: 500 },
    { type: "bool", name: "allergies" },
    { type: "text", name: "allergies_details", max: 500 },
    { type: "text", name: "medications", max: 500 },
    { type: "bool", name: "can_self_administer_meds" },
    { type: "bool", name: "chronic_illness" },
    { type: "text", name: "chronic_illness_details", max: 500 },
    { type: "bool", name: "recent_surgery" },
    { type: "text", name: "recent_surgery_details", max: 500 },
    { type: "text", name: "activity_limitations", max: 1000 },
    { type: "text", name: "other_accommodations", max: 1000 },
    { type: "text", name: "participant_signature", max: 800000 },
    {
      type: "select",
      name: "participant_signature_type",
      required: true,
      values: ["drawn", "typed", "hand"],
      maxSelect: 1,
    },
    { type: "date", name: "participant_signature_date", required: true },
    { type: "text", name: "guardian_signature", max: 800000 },
    {
      type: "select",
      name: "guardian_signature_type",
      values: ["drawn", "typed", "hand"],
      maxSelect: 1,
    },
    { type: "date", name: "guardian_signature_date" },
    { type: "text", name: "pdf_path", max: 500 },
  ]);

  // Save with public create rule (no auth needed for form submission)
  submissions.createRule = "";
  app.save(submissions);

  // Apply rules that reference relation fields
  submissions.listRule = '@request.auth.id != "" && (submitted_by = @request.auth.id || event_id.created_by = @request.auth.id)';
  submissions.viewRule = '@request.auth.id != "" && (submitted_by = @request.auth.id || event_id.created_by = @request.auth.id)';
  submissions.updateRule = '@request.auth.id != "" && (submitted_by = @request.auth.id || event_id.created_by = @request.auth.id)';
  submissions.deleteRule = '@request.auth.id != "" && event_id.created_by = @request.auth.id';
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

  // Note: users collection is built-in in PB v0.27, only custom fields were added
});
