"use client";

import { useState } from "react";
import { ProjectStage, PROJECT_STAGES, PROJECT_STAGE_LABELS, PARISHES, projectStageTracksProgress } from "@jamquote/core";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { modalStyles } from "@/components/ui/Modal";
import ClientSelectField from "./ClientSelectField";
import type { NewProjectInput } from "@/lib/api-client";
import type { ProjectDetail } from "@/lib/mock-data";
import type { ClientOption } from "./types";

const parishOptions = [{ value: "", label: "Select parish…" }, ...PARISHES.map((p) => ({ value: p, label: p }))];
// No blank option: every job is at some stage, and a new one starts at QUOTED
// (the same default the column carries).
const stageOptions = PROJECT_STAGES.map((s) => ({ value: s, label: PROJECT_STAGE_LABELS[s] }));

export interface ProjectFormValues {
  name: string;
  clientId: string;
  town: string;
  parish: string;
  address: string;
  stage: ProjectStage;
  /** Kept as the raw input string so the field can be emptied while typing;
   * `projectPayloadFromValues` is what turns it back into a number. */
  progressPct: string;
  /** Default retention % for invoices on this job. Blank = none agreed. */
  retentionPct: string;
}

export const emptyProjectForm: ProjectFormValues = {
  name: "",
  clientId: "",
  town: "",
  parish: "",
  address: "",
  stage: ProjectStage.QUOTED,
  progressPct: "0",
  retentionPct: "",
};

export function projectFormValuesFromProject(project: ProjectDetail): ProjectFormValues {
  return {
    name: project.name,
    clientId: project.clientId,
    town: project.town,
    parish: project.parish,
    address: project.addressLine,
    stage: project.stage,
    progressPct: String(project.progressPct),
    // Blank rather than "0" when none applies: an empty field reads as "no
    // retention on this job", while a 0 reads as a figure someone entered.
    retentionPct: project.retentionPct ? String(project.retentionPct) : "",
  };
}

/** 0–100, integers only — the API rejects anything else (jobs.dto.ts), so a
 * typo is clamped here rather than surfacing as a 400 on save. An emptied
 * field means "leave it alone", not 0. */
function progressFromInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function projectPayloadFromValues(values: ProjectFormValues): NewProjectInput {
  return {
    name: values.name.trim(),
    clientId: values.clientId || undefined,
    town: values.town.trim() || undefined,
    parish: values.parish || undefined,
    addressLine: values.address.trim() || undefined,
    stage: values.stage,
    progressPct: progressFromInput(values.progressPct),
    // Explicit null when cleared, so removing retention from a job actually
    // removes it rather than leaving the old percentage in place.
    retentionPct: values.retentionPct.trim() === "" ? null : Number(values.retentionPct),
  };
}

/**
 * The job field set shared by AddProjectButton, EditProjectButton, and the inline
 * "+ Add new job…" modal opened from QuoteBuilder's job picker. The client
 * field is itself a ClientSelectField, so every entry point into this form
 * also gets "+ Add new client…" inline for free.
 */
export default function ProjectForm({
  clients,
  initial = emptyProjectForm,
  submitLabel = "Save job",
  onCancel,
  onSubmit,
  onBusyChange,
  onClientCreated,
}: {
  clients: ClientOption[];
  initial?: ProjectFormValues;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: ProjectFormValues) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
  /** Bubbles a client created via the nested "+ Add new client…" up to the
   * caller, so a QuoteBuilder rendering this inside "+ Add new job…" can also
   * add it to its own client list/select. */
  onClientCreated?: (client: ClientOption) => void;
}) {
  const [values, setValues] = useState<ProjectFormValues>(initial);
  const [localClients, setLocalClients] = useState<ClientOption[]>(clients);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) =>
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
        <Input label="Town / city" value={values.town} onChange={(e) => set("town", e.target.value)} placeholder="e.g. Ocho Rios" />
        <Select label="Parish" options={parishOptions} value={values.parish} onChange={(e) => set("parish", e.target.value)} />
      </div>
      <div className={modalStyles.row2}>
        <Select
          label="Stage"
          options={stageOptions}
          value={values.stage}
          onChange={(e) => set("stage", e.target.value as ProjectStage)}
        />
        {/* Retention is a CONTRACT term, so it sits with the job rather than
            being retyped on every invoice — but each invoice keeps its own
            copy, so changing this later cannot restate what a client is
            already holding. */}
        <Input
          label="Retention %"
          type="number"
          min={0}
          max={100}
          step="0.01"
          inputMode="decimal"
          value={values.retentionPct}
          onChange={(e) => set("retentionPct", e.target.value)}
          placeholder="None"
          hint="Withheld from each invoice until the work is signed off. Leave blank if none was agreed."
        />

        <Input
          label="Progress"
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          value={values.progressPct}
          onChange={(e) => set("progressPct", e.target.value)}
          // Says where the number will and won't appear, so nobody types 40%
          // against a quoted job and assumes the list is broken when it
          // doesn't show up (projectStageTracksProgress).
          hint={
            projectStageTracksProgress(values.stage)
              ? "% of the work done — shown on the jobs list"
              : `Kept, but not shown while the job is ${PROJECT_STAGE_LABELS[values.stage].toLowerCase()}`
          }
        />
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
