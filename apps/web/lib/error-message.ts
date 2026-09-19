import { ApiError } from "@/lib/api-client";

/**
 * The message to show a contractor when something failed.
 *
 * The rule is narrow and load-bearing: **if the server answered, show what it
 * said. Otherwise show the fallback.**
 *
 * `ApiError` is thrown only when the API responded with a status and a body —
 * meaning it is running, it understood the request, and it declined. Its
 * message is a deliberate sentence written for the contractor: "Only DRAFT
 * quotes can be deleted", "You've reached your free plan limit for this month",
 * "from must not be after to". Any other throw is a genuine transport failure —
 * the fetch never completed — and the fallback is then the only honest thing
 * to show.
 *
 * ## Fallback wording
 *
 * Every fallback passed to this helper is plain English a contractor at a
 * client's kitchen table can act on — "Couldn't save — check your connection
 * and try again." — never "is the API running?", a raw HTTP status, a
 * `server error`, or a stringified `undefined`/`null`. Those are developer
 * words describing developer infrastructure; a contractor has no server to
 * check. Each call site keeps its own action-specific clause ("Couldn't send
 * —", "Couldn't add that category —") ahead of the same plain closing
 * clause, so the fallback still says what failed, just not why in developer
 * terms.
 *
 * ## Why this exists
 *
 * Thirty-eight call sites used a bare `catch {}` that discarded the error and
 * printed a developer-facing guess regardless. The owner hit it deleting a quote:
 * the API had said *"Only DRAFT quotes can be deleted"* — a deliberate business
 * rule — and the app sent them to go and check whether their server was up.
 *
 * **Reporting the wrong cause is worse than reporting none.** A generic failure
 * makes someone retry; a confidently wrong one makes them debug the wrong
 * thing. That is why the fallback is only ever reached when it is accurate.
 *
 * Deliberately does NOT surface a plain `Error.message`. A network failure's
 * "Failed to fetch" or "NetworkError when attempting to fetch resource" is
 * true but useless to a contractor at a client's kitchen table, and worse, it
 * looks like the app telling them something meaningful.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message.trim()) return err.message;
  return fallback;
}
