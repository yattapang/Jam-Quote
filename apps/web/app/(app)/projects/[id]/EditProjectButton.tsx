"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { updateProject } from "@/lib/api-client";
import ProjectForm, {
  projectFormValuesFromProject,
  projectPayloadFromValues,
  type ProjectFormValues,
} from "@/components/forms/ProjectForm";
import type { ClientOption } from "@/components/forms/types";
import type { ProjectDetail } from "@/lib/mock-data";

/** Header action on the project detail page — mirrors AddProjectButton but pre-fills
 * from the existing project and PATCHes instead of POSTing. `clients` comes from
 * the server detail page, same as AddProjectButton receives it. */
export default function EditProjectButton({ project, clients }: { project: ProjectDetail; clients: ClientOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: ProjectFormValues) {
    await updateProject(project.id, projectPayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outlineAccent" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <Modal title="Edit project" onClose={() => (busy ? undefined : setOpen(false))}>
          <ProjectForm
            clients={clients}
            initial={projectFormValuesFromProject(project)}
            submitLabel="Save changes"
            onCancel={() => setOpen(false)}
            onSubmit={handleSubmit}
            onBusyChange={setBusy}
          />
        </Modal>
      )}
    </>
  );
}
