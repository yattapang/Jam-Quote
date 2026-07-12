"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { updateJob } from "@/lib/api-client";
import { PARISHES } from "@jamquote/core";
import type { JobDetail } from "@/lib/mock-data";

const parishOptions = [{ value: "", label: "Select parish…" }, ...PARISHES.map((p) => ({ value: p, label: p }))];

/** Header action on the job detail page — mirrors EditClientButton but
 * pre-fills from the existing job and PATCHes instead of POSTing. `clients`
 * comes from the server detail page, same as AddJobButton receives it. */
export default function EditJobButton({ job, clients }: { job: JobDetail; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(job.name);
  const [clientId, setClientId] = useState(job.clientId);
  const [parish, setParish] = useState(job.parish);
  const [address, setAddress] = useState(job.addressLine);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const clientOptions = [{ value: "", label: "Select client…" }, ...clients.map((c) => ({ value: c.id, label: c.name }))];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Job name is required.");
    setSaving(true);
    setError("");
    try {
      await updateJob(job.id, {
        name: name.trim(),
        clientId: clientId || undefined,
        parish: parish || undefined,
        addressLine: address.trim() || undefined,
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
        <Modal title="Edit job" onClose={() => (saving ? null : setOpen(false))}>
          <form className={modalStyles.form} onSubmit={submit}>
            <Input label="Job name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
