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

/** Header action on the job detail page — mirrors AddJobButton but pre-fills
 * from the existing job and PATCHes instead of POSTing. `clients` comes from
 * the server detail page, same as AddJobButton receives it. */
export default function EditJobButton({ job, clients }: { job: ProjectDetail; clients: ClientOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: ProjectFormValues) {
    await updateProject(job.id, projectPayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outlineAccent" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <Modal title="Edit job" onClose={() => (busy ? undefined : setOpen(false))}>
          <ProjectForm
            clients={clients}
            initial={projectFormValuesFromProject(job)}
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
