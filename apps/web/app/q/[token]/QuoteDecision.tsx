"use client";

import { useState } from "react";
import { submitQuoteDecision } from "@/lib/public-quote";
import styles from "./shared-quote.module.css";

/**
 * Accept or decline, for someone who has never heard of JamQuote.
 *
 * Closing this loop is the point: before it, a client's yes arrived by phone
 * or WhatsApp and the quote sat at SENT forever, so the contractor's own list
 * could not tell them which jobs were actually won.
 *
 * No account, no login — the link is the credential. Requiring a sign-up to
 * say yes would send the client back to the phone, which is the exact
 * behaviour this replaces.
 *
 * Accepting asks for a typed name. It is not authentication and does not
 * pretend to be; it makes the click deliberate rather than accidental, and
 * gives the contractor a named answer to point at later.
 */
export default function QuoteDecision({
  token,
  status,
  businessName,
}: {
  token: string;
  status: string;
  businessName: string;
}) {
  const [choice, setChoice] = useState<"ACCEPT" | "DECLINE" | null>(null);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"ACCEPT" | "DECLINE" | null>(null);

  // Already answered — by this client, on another device, or by the contractor
  // directly. Showing the buttons anyway would invite a click that can only
  // fail.
  const settled = done ?? (status === "ACCEPTED" ? "ACCEPT" : status === "DECLINED" ? "DECLINE" : null);
  const openForDecision = status === "SENT" || status === "VIEWED";

  if (settled) {
    return (
      <section className={styles.decision}>
        <p className={styles.decisionDone}>
          {settled === "ACCEPT"
            ? `Accepted — thank you. ${businessName} has been notified.`
            : `You declined this quote. ${businessName} has been notified.`}
        </p>
      </section>
    );
  }

  if (!openForDecision) return null;

  async function send(decision: "ACCEPT" | "DECLINE") {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitQuoteDecision(token, {
        decision,
        name,
        reason: decision === "DECLINE" ? reason : undefined,
      });
      setDone(decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.decision}>
      <h2 className={styles.groupTitle}>Your answer</h2>

      {choice === null && (
        <div className={styles.decisionActions}>
          <button className={styles.accept} onClick={() => setChoice("ACCEPT")}>
            Accept this quote
          </button>
          <button className={styles.decline} onClick={() => setChoice("DECLINE")}>
            Decline
          </button>
        </div>
      )}

      {choice !== null && (
        <div className={styles.decisionForm}>
          <label className={styles.decisionLabel}>
            Your name
            <input
              className={styles.decisionInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marcia Brown"
              autoFocus
            />
          </label>

          {choice === "DECLINE" && (
            <label className={styles.decisionLabel}>
              Anything you&apos;d like to tell {businessName}? (optional)
              {/* Worth asking: "too expensive" and "wrong start date" lead to
                  completely different follow-ups, and a declined quote with no
                  reason tells the contractor nothing they can act on. */}
              <textarea
                className={styles.decisionInput}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Price, timing, or anything else"
              />
            </label>
          )}

          <p className={styles.decisionNote}>
            {choice === "ACCEPT"
              ? `This tells ${businessName} you are happy to go ahead at the price shown. It cannot be undone here — contact them directly if you change your mind.`
              : `This tells ${businessName} you do not want to go ahead. It cannot be undone here.`}
          </p>

          {error && <p className={styles.decisionError}>{error}</p>}

          <div className={styles.decisionActions}>
            <button
              className={styles.decisionCancel}
              onClick={() => {
                setChoice(null);
                setError("");
              }}
              disabled={busy}
            >
              Back
            </button>
            <button
              className={choice === "ACCEPT" ? styles.accept : styles.decline}
              onClick={() => send(choice)}
              disabled={busy}
            >
              {busy ? "Sending…" : choice === "ACCEPT" ? "Yes, accept" : "Yes, decline"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
