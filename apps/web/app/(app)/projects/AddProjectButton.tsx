"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createProject } from "@/lib/api-client";
import ProjectForm, { projectPayloadFromValues, type ProjectFormValues } from "@/components/forms/ProjectForm";
import type { ClientOption } from "@/components/forms/types";

export default function AddProjectButton({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: ProjectFormValues) {
    await createProject(projectPayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        New project
      </Button>
      {open && (
        <Modal title="New project" onClose={() => (busy ? undefined : setOpen(false))}>
          <ProjectForm clients={clients} submitLabel="Save job" onCancel={() => setOpen(false)} onSubmit={handleSubmit} onBusyChange={setBusy} />
        </Modal>
      )}
    </>
  );
}
