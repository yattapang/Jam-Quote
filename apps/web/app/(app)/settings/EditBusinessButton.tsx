"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { updateBusiness } from "@/lib/api-client";
import { PARISHES } from "@jamquote/core";
import type { Business } from "@/lib/types";

const parishOptions = [{ value: "", label: "Select parish…" }, ...PARISHES.map((p) => ({ value: p, label: p }))];

/** Header action on the settings page — mirrors EditClientButton: pre-fills a
 * form from the live business and PATCHes /business/:id instead of POSTing.
 * Fields exposed here match updateBusinessSchema (business.dto.ts) exactly;
 * the Business Prisma model has no phone/email field (those live only on the
 * not-yet-persisted WhatsApp/email fixture cards elsewhere on this page). */
export default function EditBusinessButton({ business }: { business: Business }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(business.name);
  const [trn, setTrn] = useState(business.trn);
  const [parish, setParish] = useState<string>(business.parish);
  const [tradeType, setTradeType] = useState(business.tradeType);
  const [addressLine, setAddressLine] = useState(business.addressLine);
  const [gctPct, setGctPct] = useState(String(business.defaultGctRatePct));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Business name is required.");
    const gctValue = Number(gctPct);
    if (gctPct.trim() !== "" && (Number.isNaN(gctValue) || gctValue < 0 || gctValue > 100)) {
      return setError("Default GCT rate must be a number between 0 and 100.");
    }
    setSaving(true);
    setError("");
    try {
      await updateBusiness(business.id, {
        name: name.trim(),
        trn: trn.trim() || undefined,
        parish: parish || undefined,
        tradeType: tradeType.trim() || undefined,
        addressLine: addressLine.trim() || undefined,
        defaultGctRatePct: gctPct.trim() === "" ? undefined : gctValue,
      });
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't save — is the API running?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outlineAccent" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <Modal title="Edit business profile" onClose={() => (saving ? null : setOpen(false))}>
          <form className={modalStyles.form} onSubmit={submit}>
            <Input label="Business name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className={modalStyles.row2}>
              <Input label="TRN" value={trn} onChange={(e) => setTrn(e.target.value)} placeholder="102-458-963" />
              <Select label="Parish" options={parishOptions} value={parish} onChange={(e) => setParish(e.target.value)} />
            </div>
            <div className={modalStyles.row2}>
              <Input label="Trade type" value={tradeType} onChange={(e) => setTradeType(e.target.value)} />
              <Input
                label="Default GCT rate (%)"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={gctPct}
                onChange={(e) => setGctPct(e.target.value)}
              />
            </div>
            <Input label="Address" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
            {error && <span className={modalStyles.error}>{error}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
