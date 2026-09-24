/**
 * CORE: audit — who did what, to which tenant, when.
 *
 * Owns:        the only way an entry is written.
 * Trusted by:  every module that changes money, permissions or tenancy (Rule 5).
 * Never does:  accept an actor the caller asserts without a resolved caller behind it; write
 *              outside the transaction that made the change; let a credential into `details`.
 *
 * WHY THE TRANSACTION IS THE FIRST ARGUMENT
 *
 * An entry written outside the transaction that made the change produces one of two lies: a change
 * with no entry (the write committed, the entry failed) or an entry for a change that never
 * happened (the entry committed, the change rolled back). Both are worse than no trail at all,
 * because both get trusted during an incident. So the signature makes the correct thing the only
 * available thing, and the test rolls a transaction back to prove the entry goes with it.
 *
 * WHY IT CANNOT BE EDITED AFTERWARDS
 *
 * The table has policies for SELECT and INSERT and none for UPDATE or DELETE, so Postgres refuses
 * those commands even to a role that holds the grant (see the migration). There is no `amend()`
 * here, and there should never be one: a mistaken entry is corrected by a later entry, not by
 * rewriting the first.
 */
import type { TransactionalClient } from "../tenancy/tenant-context.js";

/**
 * What kind of thing acted.
 *
 * `system` covers a scheduled job or a sweep — something with no person behind it. It is the only
 * kind allowed to have no actor id, and the database has a CHECK saying so, because a human action
 * with no actor is not an audit entry, it is a rumour.
 */
export type ActorKind = "tenant_user" | "platform_staff" | "system";

/**
 * Every action that can be recorded.
 *
 * A typed union rather than a free string, so a typo cannot silently invent a new action and split
 * one behaviour across two names nobody thinks to search for. It grows by an explicit edit — which
 * is the point: adding an audited action should be a decision, visible in a diff.
 *
 * Only the actions that exist today are listed. There are no invoices to void yet, and a name for
 * an action nothing performs would be scaffolding pretending to be coverage.
 */
export type AuditAction =
  | "tenant.created"
  | "tenant.profile_changed"
  | "tenant.suspended"
  | "tenant.unsuspended"
  | "user.invited"
  | "user.role_changed"
  | "user.deactivated"
  | "user.reactivated"
  | "user.deleted"
  | "user.password_changed"
  | "user.sessions_revoked"
  // The second factor. "enrolled" and "locked" are here rather than in a log because they are
  // the two events somebody investigating a compromised staff account looks for first, and a
  // recovery code used is the one signal that an authenticator was lost or taken (ADR 0021).
  | "user.mfa_enrolled"
  | "user.mfa_recovery_code_used"
  | "user.mfa_locked"
  | "staff.impersonation_started"
  | "staff.impersonation_ended";

/** What the action was performed on. `null` subject means the tenant itself. */
export interface AuditSubject {
  readonly type: "tenant" | "app_user" | "app_session";
  readonly id: string | null;
}

export interface AuditEntry {
  readonly tenantId: string;
  readonly actorKind: ActorKind;
  /** Required for every kind except `system`. */
  readonly actorUserId?: string | null;
  readonly action: AuditAction;
  readonly subject: AuditSubject;
  /** One sentence a person can read during an incident without decoding `details`. */
  readonly summary: string;
  /** Redacted by the caller. See `assertNoSecrets`. */
  readonly details?: Record<string, unknown>;
  /** The caller's address, where the transport knows it. Personal data — see the migration. */
  readonly actorIp?: string | null;
  /** Injected for tests; the action's moment, not the write's. */
  readonly occurredAt?: Date;
}

export class AuditEntryRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditEntryRejected";
  }
}

/**
 * Keys whose presence in `details` is refused.
 *
 * The audit trail is the one table humans read under pressure, and it is the last place a
 * credential should be sitting. Matched on the key rather than the value, and nested, because the
 * realistic mistake is `details: { user: requestBody }` where the body still holds a password.
 *
 * Phase 0's related lesson: the previous application's audit details carried money figures
 * readable by any staff role and had to be given redact-by-default. Here the WRITER redacts, and a
 * capability-gated read path is owed with the admin console — recorded rather than half-built.
 */
const FORBIDDEN_KEY = /pass(word|phrase)|secret|token|credential|private[_-]?key|otp|totp|mfa|hash|salt|session[_-]?id/i;

export function assertNoSecrets(details: Record<string, unknown>, path = "details"): void {
  for (const [key, value] of Object.entries(details)) {
    const here = `${path}.${key}`;
    if (FORBIDDEN_KEY.test(key)) {
      throw new AuditEntryRejected(
        `${here} looks like a credential. An audit entry is read by humans during an incident, ` +
          `so it must never carry one. Record that the thing changed, not what it changed to.`,
      );
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      assertNoSecrets(value as Record<string, unknown>, here);
    }
  }
}

/**
 * Writes one entry, inside the caller's transaction.
 *
 * @param tx the transaction that is making the change being described. Not a client: see the
 *   header. If this entry and its change are not atomic, the trail is worse than absent.
 */
export async function record(
  tx: TransactionalClient,
  entry: AuditEntry,
  newId: () => string,
): Promise<void> {
  if (entry.actorKind === "system") {
    if (entry.actorUserId) {
      throw new AuditEntryRejected(
        "A 'system' action has no actor. Passing one hides which person was really responsible.",
      );
    }
  } else if (!entry.actorUserId) {
    throw new AuditEntryRejected(
      `A '${entry.actorKind}' action must name its actor. An action with no actor is not an audit ` +
        `entry, it is a rumour.`,
    );
  }

  if (!entry.summary.trim()) {
    throw new AuditEntryRejected(
      "An entry needs a one-sentence summary. During an incident it is what gets read first, and " +
        "an empty one makes the trail unreadable exactly when it matters.",
    );
  }

  const details = entry.details ?? {};
  assertNoSecrets(details);

  await tx.$executeRawUnsafe(
    `INSERT INTO audit_entry
       (id, tenant_id, occurred_at, actor_kind, actor_user_id, action,
        subject_type, subject_id, summary, details, actor_ip)
     VALUES ($1, $2, COALESCE($3::timestamptz, now()), $4, $5, $6, $7, $8, $9, $10::jsonb, $11::inet)`,
    newId(),
    entry.tenantId,
    entry.occurredAt?.toISOString() ?? null,
    entry.actorKind,
    entry.actorUserId ?? null,
    entry.action,
    entry.subject.type,
    entry.subject.id,
    entry.summary,
    JSON.stringify(details),
    entry.actorIp ?? null,
  );
}
