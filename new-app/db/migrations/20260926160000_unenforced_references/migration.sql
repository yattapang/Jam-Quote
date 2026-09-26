-- Two references that named a real table and were enforced by nothing (found by J9's new guard).
--
-- ## HOW THESE WERE FOUND, WHICH IS THE POINT OF THE MIGRATION
--
-- `tools/check_schema_citations.py` was written to catch J9 — `acceptance.document_render_id`
-- pointing at a table no migration created. Its first version accepted a column that had "a foreign
-- key OR a table of that name", and the plant proved that wrong: deleting the foreign key from a
-- column whose table existed passed silently. Requiring the key outright then reported two more:
--
--   * `audit_entry.actor_user_id` — nullable for `system` actions, with a CHECK enforcing that
--     nullability, and no foreign key. The nullability was designed; the absence of the key was not
--     stated anywhere, and a nullable column can carry one, because NULL satisfies a foreign key.
--   * `platform_capability.granted_by_user_id` — the same shape, nullable only for the bootstrap
--     grant that exists before any person does.
--
-- Neither was a deliberate decision that had been written down. That is the distinction this
-- migration turns on: `audit_entry.subject_id` IS deliberate — it is polymorphic, any table may be a
-- subject, and it is recorded as unconstrained with its reason in the guard. These two were simply
-- never enforced.
--
-- ## WHY IT MATTERS FOR THESE TWO COLUMNS IN PARTICULAR
--
-- They are the two columns in the schema that answer **"who did this?"** — one for the audit trail,
-- one for a privilege grant. An unenforced actor is worse than an unenforced anything else: an audit
-- entry naming a user id that never existed is not a gap in the trail, it is a **false trail**, and
-- it would pass every check the schema had. Rule 5.1 asks that a grant have an author; until now the
-- database would accept any UUID as that author.
--
-- ## THE CONSEQUENCE, STATED BECAUSE IT IS A REAL TRADE AND NOT A FREE WIN
--
-- `ON DELETE RESTRICT`, consistent with every other foreign key here, means **a user row that has
-- audit entries or has granted a capability can no longer be hard-deleted.** That is deliberate for
-- the audit trail. It also means erasure of a person is done by **redacting the user row**, not by
-- deleting it — which is the normal answer for audited systems, and which the PRD's erasure
-- requirement does not yet spell out. Recorded as owed rather than decided here: the schema now
-- forces the question instead of leaving a delete that would silently orphan the trail.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not make the audit trail trustworthy. A foreign key proves the actor EXISTS, not that
--   the actor did the thing; only the writer's own discipline and Rule 5.1 do that.
-- - It does not backfill or validate existing rows — there are none outside tests.
-- - It says nothing about `audit_entry.subject_id`, which stays polymorphic on purpose.

ALTER TABLE "audit_entry" ADD CONSTRAINT "audit_entry_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "app_user" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_capability" ADD CONSTRAINT "platform_capability_granted_by_user_id_fkey"
    FOREIGN KEY ("granted_by_user_id") REFERENCES "app_user" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
