"use client";

import { useState } from "react";
import { PARISHES } from "@jamquote/core";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { modalStyles } from "@/components/ui/Modal";
import ClientSelectField from "./ClientSelectField";
import type { NewJobInput } from "@/lib/api-client";
import type { JobDetail } from "@/lib/mock-data";
import type { ClientOption } from "./types";

const parishOptions = [{ value: "", label: "Select parish…" }, ...PARISHES.map((p) => ({ value: p, label: p }))];

export interface JobFormValues {
  name: string;
  clientId: string;
  parish: string;
  address: string;
}

export const emptyJobForm: JobFormValues = { name: "", clientId: "", parish: "", address: "" };

export function jobFormValuesFromJob(job: JobDetail): JobFormValues {
  return { name: job.name, clientId: job.clientId, parish: job.parish, address: job.addressLine };
}

export function jobPayloadFromValues(values: JobFormValues): NewJobInput {
  return {
    name: values.name.trim(),
    clientId: values.clientId || undefined,
    parish: values.parish || undefined,
    addressLine: values.address.trim() || undefined,
  };
}

/**
 * The job field set shared by AddJobButton, EditJobButton, and the inline
 * "+ Add new job…" modal opened from QuoteBuilder's job picker. The client
 * field is itself a ClientSelectField, so every entry point into this form
 * also gets "+ Add new client…" inline for free.
 */
export default function JobForm({
  clients,
  initial = emptyJobForm,
  submitLabel = "Save job",
  onCancel,
  onSubmit,
  onBusyChange,
  onClientCreated,
}: {
  clients: ClientOption[];
  initial?: JobFormValues;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: JobFormValues) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
  /** Bubbles a client created via the nested "+ Add new client…" up to the
   * caller, so a QuoteBuilder rendering this inside "+ Add new job…" can also
   * add it to its own client list/select. */
  onClientCreated?: (client: ClientOption) => void;
}) {
  const [values, setValues] = useState<JobFormValues>(initial);
  const [localClients, setLocalClients] = useState<ClientOption[]>(clients);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return setError("Job name is required.");
    setSaving(true);
    onBusyChange?.(true);
    setError("");
    try {
      await onSubmit(values);
    } catch {
      setError("Couldn't save — is the API running?");
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  return (
    <form className={modalStyles.form} onSubmit={submit}>
      <Input
        label="Job name"
        value={values.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="e.g. Retaining wall, Spanish Town"
        autoFocus
      />
      <ClientSelectField
        clients={localClients}
        value={values.clientId}
        onChange={(id) => set("clientId", id)}
        onCreated={(client) => {
          setLocalClients((cs) => [...cs, client]);
          onClientCreated?.(client);
        }}
      />
      <div className={modalStyles.row2}>
        <Input label="Address" value={values.address} onChange={(e) => set("address", e.target.value)} />
        <Select label="Parish" options={parishOptions} value={values.parish} onChange={(e) => set("parish", e.target.value)} />
      </div>
      {error && <span className={modalStyles.error}>{error}</span>}
      <div className={modalStyles.actions}>
        <Button variant="ghost" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
