"use client";

import { useState } from "react";
import { formatJmd } from "@jamquote/core";
import Button from "@/components/ui/Button";
import { shareQuote } from "@/lib/api-client";

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

/**
 * Click-to-chat on WhatsApp — free, no Business API, no service to pay for.
 *
 * It now mints a PUBLIC share link first. It previously sent the client
 * `/quotes/<id>`, which sits behind the auth middleware: the client hit a
 * login wall while the contractor saw the message send and assumed it had
 * arrived. The same silent non-delivery the email path had, on the channel
 * most Jamaican contractors actually use.
 */
export default function WhatsAppButton({
  quoteId,
  quoteNum,
  clientName,
  clientPhone,
  totalCents,
}: WhatsAppButtonProps) {
  const hasPhone = Boolean(clientPhone && clientPhone.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const { shareToken } = await shareQuote(quoteId);
      const quoteLink = `${window.location.origin}/q/${shareToken}`;
      const message =
        `Hi ${clientName || "there"}, here's your quote ${quoteNum} for ${formatJmd(totalCents)}. ` +
        `View it here: ${quoteLink}`;
      const intlPhone = hasPhone ? toIntlPhone(clientPhone!) : "";
      // Opened only AFTER the link exists. Opening first and filling in the
      // message later would hand the contractor a half-written chat if the
      // share call failed.
      window.open(
        `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      setError("Couldn't create the share link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={!hasPhone || busy}
        title={hasPhone ? undefined : "No phone number on file for this client"}
      >
        {busy ? "Preparing…" : "Send on WhatsApp"}
      </Button>
      {error && (
        <span style={{ fontSize: 11.5, color: "var(--critical)" }}>{error}</span>
      )}
    </>
  );
}
