/// <reference path="../pb_data/types.d.ts" />

/**
 * Rename legacy Young Women class keys in events.organizations JSON arrays.
 * - beehives  -> builders_of_faith
 * - mia_maids -> messengers_of_hope
 * - laurels   -> gatherers_of_light
 *
 * Idempotent: only rewrites records that still contain a legacy key.
 */

const RENAMES = {
  beehives: "builders_of_faith",
  mia_maids: "messengers_of_hope",
  laurels: "gatherers_of_light",
};

const REVERSE_RENAMES = {
  builders_of_faith: "beehives",
  messengers_of_hope: "mia_maids",
  gatherers_of_light: "laurels",
};

function rewriteEvents(app, map) {
  const events = app.findRecordsByFilter(
    "events",
    "organizations ~ 'beehives' || organizations ~ 'mia_maids' || organizations ~ 'laurels' || organizations ~ 'builders_of_faith' || organizations ~ 'messengers_of_hope' || organizations ~ 'gatherers_of_light'",
    "",
    0,
    0
  );
  for (const event of events) {
    const raw = event.get("organizations");
    if (!raw) continue;
    let orgs;
    try {
      orgs = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      continue;
    }
    if (!Array.isArray(orgs)) continue;
    let changed = false;
    const renamed = orgs.map((k) => {
      if (map[k]) {
        changed = true;
        return map[k];
      }
      return k;
    });
    if (changed) {
      event.set("organizations", JSON.stringify(renamed));
      app.save(event);
    }
  }
}

migrate(
  (app) => {
    rewriteEvents(app, RENAMES);
  },
  (app) => {
    rewriteEvents(app, REVERSE_RENAMES);
  }
);
