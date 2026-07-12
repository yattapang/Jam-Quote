"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { createMaterialFavourite } from "@/lib/api-client";

export default function AddMaterialButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    setSaving(true);
    setError("");
    try {
      await createMaterialFavourite({
        name: name.trim(),
        unit: unit.trim() || undefined,
        priceCents: Math.round((Number(priceDollars) || 0) * 100),
      });
      setOpen(false);
      setName("");
      setUnit("");
      setPriceDollars("");
      router.refresh();
    } catch {
      setError("Couldn't save — is the API running?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Add material
      </Button>
      {open && (
        <Modal title="Add material" onClose={() => (saving ? null : setOpen(false))}>
          <form className={modalStyles.form} onSubmit={submit}>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Cement" />
            <div className={modalStyles.row2}>
              <Input label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. bag" />
              <Input
                label="Price $"
                type="number"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
              />
            </div>
            {error && <span className={modalStyles.error}>{error}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                {saving ? "Saving…" : "Save material"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
