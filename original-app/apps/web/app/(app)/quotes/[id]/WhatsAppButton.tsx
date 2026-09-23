"use client";

import { useState, forwardRef, useImperativeHandle } from "react";
import { formatJmd } from "@jamquote/core";
import Button from "@/components/ui/Button";
import { shareQuote } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { useSingleFlight } from "@/lib/use-single-flight";

/**
 * Normalizes a Jamaican phone number to the intl digits wa.me expects
 * (no "+", no punctuation). 876-area numbers are the common case; the last
 * branch is a graceful fallback for anything already in another format.
 */
export function toIntlPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("876")) return `1${digits}`;
  if (digits.length === 7) return `1876${digits}`;
  if (digits.startsWith("1")) return digits;
  return digits;
}

interface WhatsAppButtonProps {
  quoteId: string;
  quoteNum: string;
  clientName?: string;
  clientPhone?: string;
  totalCents: number;
}

/** Imperative handle exposed via ref: lets the Send chooser in QuoteActions
 * trigger the exact same WhatsApp flow this button uses, instead of
 * reimplementing it. */
export interface WhatsAppButtonHandle {
  open: () => void;
}

/**
 * Click-to-chat on WhatsApp — free, no Business API, no service to pay for.
 *
 * It now mints a PUBLIC share link first. It previously sent the client
 * `/quotes/<id>`, which sits behind the auth middleware: the client hit a
 * login wall while the contractor saw the message send and assumed it had
 * arrived. The same silent non-delivery the email path had, on the channel
 * most Jamaican contractors actually use.
 */
const WhatsAppButton = forwardRef<WhatsAppButtonHandle, WhatsAppButtonProps>(function WhatsAppButton(
  { quoteId, quoteNum, clientName, clientPhone, totalCents },
  ref,
) {
  const hasPhone = Boolean(clientPhone && clientPhone.trim());
  const [error, setError] = useState<string | null>(null);

  // A double tap (or the imperative `open` fired twice by the Send chooser)
  // must not mint two share links and open two tabs — single-flight guards
  // re-entry synchronously, and the phone check happens before anything async
  // starts so a phoneless client can never reach the API call at all.
  const { run: handleClick, pending: busy } = useSingleFlight(async () => {
    if (!hasPhone) return;
    setError(null);
    try {
      const { shareToken } = await shareQuote(quoteId);
      const quoteLink = `${window.location.origin}/q/${shareToken}`;
      const message =
        `Hi ${clientName || "there"}, here's your quote ${quoteNum} for ${formatJmd(totalCents)}. ` +
        `View it here: ${quoteLink}`;
      const intlPhone = toIntlPhone(clientPhone!);
      // Opened only AFTER the link exists. Opening first and filling in the
      // message later would hand the contractor a half-written chat if the
      // share call failed.
      window.open(
        `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the share link — check your connection and try again."));
    }
  });

  useImperativeHandle(ref, () => ({
    open: () => void handleClick(),
  }));

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleClick()}
        disabled={!hasPhone || busy}
        title={hasPhone ? undefined : "No phone number on file for this client"}
      >
        {busy ? "Preparing…" : "Send on WhatsApp"}
      </Button>
      {error && (
        <span style={{ fontSize: 11.5, color: "var(--jq-crit)" }}>{error}</span>
      )}
    </>
  );
});

export default WhatsAppButton;
