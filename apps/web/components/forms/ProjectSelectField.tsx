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

const ADD_NEW = "__add_new_project__";

/**
 * A project <Select> with an inline "+ Add new project…" option, mirroring
 * ClientSelectField. Picking it opens a Modal with ProjectForm (which itself
 * offers "+ Add new client…"); on success the new project is appended to the
 * caller's list and immediately selected — no navigation.
 *
 * This field was still worded in the pre-rename vocabulary — "Job (optional)",
 * "+ Add new job…", "Add job" — while calling `createProject`. Per §1 a JOB is
 * the reusable priced template in the library; a PROJECT is the client work
 * this quote belongs to. Getting that wrong here is not cosmetic: the quote
 * builder ALSO has a genuine "+ Add new job…" for the library, so the two read
 * as the same thing while doing something completely different.
 */
export default function ProjectSelectField({
  label = "Project (optional)",
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
   * project's client so the contractor is not asked for it a second time on
   * the same screen — being asked twice invites picking a near-duplicate
   * client (or creating one), and then the project hangs off the wrong
   * record.
   */
  defaultClientId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const options = [
    { value: "", label: placeholder },
    ...projects.map((j) => ({ value: j.id, label: j.name })),
    { value: ADD_NEW, label: "+ Add new project…" },
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
        <Modal title="Add new project" onClose={() => (busy ? undefined : setOpen(false))}>
          <ProjectForm
            clients={clients}
            // Re-keyed on the client so re-opening the modal after changing the
            // quote's client starts from the new one, not the stale first mount.
            key={defaultClientId ?? ""}
            initial={
              defaultClientId ? { ...emptyProjectForm, clientId: defaultClientId } : emptyProjectForm
            }
            submitLabel="Add project"
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
