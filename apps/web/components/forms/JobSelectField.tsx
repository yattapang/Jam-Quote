"use client";

import { useState } from "react";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import { createJob } from "@/lib/api-client";
import JobForm, { jobPayloadFromValues, type JobFormValues } from "./JobForm";
import type { ClientOption, JobOption } from "./types";

const ADD_NEW = "__add_new_job__";

/**
 * A job <Select> with an inline "+ Add new job…" option, mirroring
 * ClientSelectField. Picking it opens a Modal with JobForm (which itself
 * offers "+ Add new client…"); on success the new job is appended to the
 * caller's list and immediately selected — no navigation.
 */
export default function JobSelectField({
  label = "Job (optional)",
  placeholder = "None",
  jobs,
  clients,
  value,
  onChange,
  onCreated,
  onClientCreated,
}: {
  label?: string;
  placeholder?: string;
  jobs: JobOption[];
  clients: ClientOption[];
  value: string;
  onChange: (jobId: string) => void;
  onCreated: (job: JobOption) => void;
  onClientCreated?: (client: ClientOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const options = [
    { value: "", label: placeholder },
    ...jobs.map((j) => ({ value: j.id, label: j.name })),
    { value: ADD_NEW, label: "+ Add new job…" },
  ];

  function handleChange(next: string) {
    if (next === ADD_NEW) {
      setOpen(true);
      return;
    }
    onChange(next);
  }

  async function handleCreate(values: JobFormValues) {
    const { id } = await createJob(jobPayloadFromValues(values));
    const created = { id, name: values.name.trim() };
    onCreated(created);
    onChange(created.id);
    setOpen(false);
  }

  return (
    <>
      <Select label={label} options={options} value={value} onChange={(e) => handleChange(e.target.value)} />
      {open && (
        <Modal title="Add new job" onClose={() => (busy ? undefined : setOpen(false))}>
          <JobForm
            clients={clients}
            submitLabel="Add job"
            onCancel={() => setOpen(false)}
            onSubmit={handleCreate}
            onBusyChange={setBusy}
            onClientCreated={onClientCreated}
          />
        </Modal>
      )}
    </>
  );
}
