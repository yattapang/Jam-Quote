"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { createJob } from "@/lib/api-client";
import { PARISHES } from "@jamquote/core";

const parishOptions = [{ value: "", label: "Select parish…" }, ...PARISHES.map((p) => ({ value: p, label: p }))];

export default function AddJobButton({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [parish, setParish] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const clientOptions = [{ value: "", label: "Select client…" }, ...clients.map((c) => ({ value: c.id, label: c.name }))];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Job name is required.");
    setSaving(true);
    setError("");
    try {
      await createJob({
        name: name.trim(),
        clientId: clientId || undefined,
        parish: parish || undefined,
        addressLine: address.trim() || undefined,
      });
      setOpen(false);
      setName("");
      setClientId("");
      setParish("");
      setAddress("");
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
        New job
      </Button>
      {open && (
        <Modal title="New job" onClose={() => (saving ? null : setOpen(false))}>
          <form className={modalStyles.form} onSubmit={submit}>
            <Input label="Job name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retaining wall, Spanish Town" autoFocus />
            <Select label="Client" options={clientOptions} value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <div className={modalStyles.row2}>
              <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
              <Select label="Parish" options={parishOptions} value={parish} onChange={(e) => setParish(e.target.value)} />
            </div>
            {error && <span className={modalStyles.error}>{error}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                {saving ? "Saving…" : "Save job"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
