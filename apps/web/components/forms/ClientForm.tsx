"use client";

import { useState } from "react";
import { PARISHES } from "@jamquote/core";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { modalStyles } from "@/components/ui/Modal";
import type { NewClientInput } from "@/lib/api-client";
import type { Client } from "@/lib/types";

const parishOptions = [{ value: "", label: "Select parish…" }, ...PARISHES.map((p) => ({ value: p, label: p }))];

export interface ClientFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  parish: string;
  address: string;
}

export const emptyClientForm: ClientFormValues = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  parish: "",
  address: "",
};

export function clientFormValuesFromClient(client: Client): ClientFormValues {
  return {
    firstName: client.firstName,
    lastName: client.lastName,
    phone: client.phone,
    email: client.email ?? "",
    parish: client.parish,
    address: client.address,
  };
}

export function clientPayloadFromValues(values: ClientFormValues): NewClientInput {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim() || undefined,
    phone: values.phone.trim() || undefined,
    email: values.email.trim() || undefined,
    parish: values.parish || undefined,
    addressLine: values.address.trim() || undefined,
  };
}

/**
 * The client field set shared by AddClientButton, EditClientButton, and the
 * inline "+ Add new client…" modal opened from a client picker (QuoteBuilder,
 * AddJobButton/JobForm). Owns its own saving/error state so every caller gets
 * identical validation + failure messaging; the caller only supplies what
 * happens on success (create vs. update, append-and-select vs. refresh).
 */
export default function ClientForm({
  initial = emptyClientForm,
  submitLabel = "Save client",
  onCancel,
  onSubmit,
  onBusyChange,
}: {
  initial?: ClientFormValues;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: ClientFormValues) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [values, setValues] = useState<ClientFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.firstName.trim()) return setError("First name is required.");
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
      <div className={modalStyles.row2}>
        <Input label="First name" value={values.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus />
        <Input label="Last name" value={values.lastName} onChange={(e) => set("lastName", e.target.value)} />
      </div>
      <div className={modalStyles.row2}>
        <Input label="Phone" value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="876 …" />
        <Input
          label="Email"
          type="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="client@example.com"
        />
      </div>
      <Select label="Parish" options={parishOptions} value={values.parish} onChange={(e) => set("parish", e.target.value)} />
      <Input label="Address" value={values.address} onChange={(e) => set("address", e.target.value)} />
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
