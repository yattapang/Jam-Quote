"use client";

import { formatJmd } from "@jamquote/core";
import Button from "@/components/ui/Button";

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

/** Client island: click-to-chat on WhatsApp Web/app, no server round trip. */
export default function WhatsAppButton({
  quoteId,
  quoteNum,
  clientName,
  clientPhone,
  totalCents,
}: WhatsAppButtonProps) {
  const hasPhone = Boolean(clientPhone && clientPhone.trim());

  function handleClick() {
    const quoteLink = `${window.location.origin}/quotes/${quoteId}`;
    const message =
      `Hi ${clientName || "there"}, here's your quote ${quoteNum} for ${formatJmd(totalCents)}. ` +
      `View it (and download the PDF) here: ${quoteLink}`;
    const intlPhone = hasPhone ? toIntlPhone(clientPhone!) : "";
    window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleClick}
      disabled={!hasPhone}
      title={hasPhone ? undefined : "No phone number on file for this client"}
    >
      Send on WhatsApp
    </Button>
  );
}
