"use client";

import { useState } from "react";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import { createProject } from "@/lib/api-client";
import ProjectForm, {
  emptyProjectForm,
  projectPayloadFromValues,
  type ProjectFormValues,
} from "./ProjectForm";
import type { ClientOption, ProjectOption } from "./types";

const ADD_NEW = "__add_new_job__";

/**
 * A job <Select> with an inline "+ Add new job…" option, mirroring
 * ClientSelectField. Picking it opens a Modal with ProjectForm (which itself
 * offers "+ Add new client…"); on success the new job is appended to the
 * caller's list and immediately selected — no navigation.
 */
export default function ProjectSelectField({
  label = "Job (optional)",
  placeholder = "None",
  projects,
  clients,
  value,
  onChange,
  onCreated,
  onClientCreated,
  defaultClientId,
}: {
  label?: string;
  placeholder?: string;
  projects: ProjectOption[];
  clients: ClientOption[];
  value: string;
  onChange: (projectId: string) => void;
  onCreated: (project: ProjectOption) => void;
  onClientCreated?: (client: ClientOption) => void;
  /**
   * The client the surrounding document has already chosen. Pre-fills the new
   * job's client so the contractor is not asked for it a second time on the
   * same screen — being asked twice invites picking a near-duplicate client
   * (or creating one), and then the job hangs off the wrong record.
   */
  defaultClientId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const options = [
    { value: "", label: placeholder },
    ...projects.map((j) => ({ value: j.id, label: j.name })),
    { value: ADD_NEW, label: "+ Add new job…" },
  ];

  function handleChange(next: string) {
    if (next === ADD_NEW) {
      setOpen(true);
      return;
    }
    onChange(next);
  }

  async function handleCreate(values: ProjectFormValues) {
    const { id } = await createProject(projectPayloadFromValues(values));
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
          <ProjectForm
            clients={clients}
            // Re-keyed on the client so re-opening the modal after changing the
            // quote's client starts from the new one, not the stale first mount.
            key={defaultClientId ?? ""}
            initial={
              defaultClientId ? { ...emptyProjectForm, clientId: defaultClientId } : emptyProjectForm
            }
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
