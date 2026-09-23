// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectStage } from "@jamquote/core";
import EditProjectButton from "./EditProjectButton";
import type { ProjectDetail } from "@/lib/mock-data";

// Rendering a form and driving it with userEvent exceeds vitest's 5s default under the
// full parallel run; this was intermittently timing out, a harness limit, not behaviour.
vi.setConfig({ testTimeout: 30_000 });

/**
 * Wiring test mirroring EditMaterialButton.test.tsx: EditProjectButton must
 * call projectEditPayloadFromValues (sends explicit null for a blanked
 * town), not projectPayloadFromValues (the create builder, which omits it —
 * a no-op on a PATCH). Reverting EditProjectButton.tsx:25 to the create
 * builder must fail this test.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    updateProject: vi.fn().mockResolvedValue({}),
  };
});

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "proj-1",
    name: "Retaining wall",
    clientId: "client-1",
    clientName: "Jane Doe",
    addressLine: "1 Main St",
    town: "Ocho Rios",
    parish: "St. Ann",
    stage: ProjectStage.QUOTED,
    progressPct: 0,
    retentionPct: 0,
    ...overrides,
  };
}

describe("EditProjectButton wiring", () => {
  it("blanking the town sends an explicit null, not an omission", async () => {
    const { updateProject } = await import("@/lib/api-client");
    render(
      <EditProjectButton
        project={project()}
        clients={[{ id: "client-1", name: "Jane Doe" }]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    const town = await screen.findByLabelText(/town \/ city/i);
    await userEvent.clear(town);

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateProject).toHaveBeenCalledTimes(1);
    const [id, payload] = (updateProject as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(id).toBe("proj-1");
    expect(payload.town).toBeNull();
    expect("town" in payload).toBe(true);
  });
});
