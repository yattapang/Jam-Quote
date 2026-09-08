// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectForm, { emptyProjectForm, projectPayloadFromValues } from "./ProjectForm";

/**
 * The project form, where two distinctions matter more than they look.
 *
 * **Blank retention is not zero.** A contractor who typed 0 is saying "no
 * retention on this contract"; one who typed nothing is saying "not agreed".
 * The payload must keep them apart — `null` versus `0` — because collapsing them
 * writes a figure nobody stated.
 *
 * **The vocabulary.** This creates a PROJECT (client work), not a JOB (the
 * reusable priced template). The field said "Job name" while calling
 * `createProject`, and the quote builder has a genuine "+ Add new job…" for the
 * library — two controls reading identically and doing different things. The
 * label assertions below are deliberately about the words on screen.
 */

function renderForm(overrides: Partial<typeof emptyProjectForm> = {}) {
  const onSubmit = vi.fn();
  render(
    <ProjectForm
      clients={[{ id: "cl_1", name: "Marcia Brown" }]}
      initial={{ ...emptyProjectForm, ...overrides }}
      onCancel={() => {}}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe("ProjectForm — retention", () => {
  it("starts blank, not zero", () => {
    // A form that opens showing 0 has answered a contract question nobody
    // asked.
    renderForm();
    expect(screen.getByLabelText(/retention/i)).toHaveValue(null);
  });

  it("sends null when left blank", () => {
    expect(projectPayloadFromValues({ ...emptyProjectForm, name: "Wall" }).retentionPct).toBeNull();
  });

  it("sends 0 when a contractor deliberately types 0", () => {
    // Distinct from blank. "No retention agreed on this contract" is a
    // statement; "not filled in" is not.
    const payload = projectPayloadFromValues({
      ...emptyProjectForm,
      name: "Wall",
      retentionPct: "0",
    });
    expect(payload.retentionPct).toBe(0);
  });

  it("sends the number a contractor typed", () => {
    const payload = projectPayloadFromValues({
      ...emptyProjectForm,
      name: "Wall",
      retentionPct: "10",
    });
    expect(payload.retentionPct).toBe(10);
  });

  it("treats a cleared field as removing retention, not as keeping the old value", () => {
    // Editing a project down to no retention must actually remove it. An
    // `undefined` here would mean "not mentioned" and leave the stored
    // percentage in place.
    const payload = projectPayloadFromValues({
      ...emptyProjectForm,
      name: "Wall",
      retentionPct: "   ",
    });
    expect(payload.retentionPct).toBeNull();
  });
});

describe("ProjectForm — the vocabulary on screen", () => {
  it("calls it a PROJECT, not a job", async () => {
    // It creates client work. A JOB is the reusable priced template, and the
    // quote builder has its own genuine "+ Add new job" for that library.
    renderForm();
    expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^job name$/i)).not.toBeInTheDocument();
  });

  it("offers Enquiry as a stage, ahead of Quoted", () => {
    // Added because the ladder used to start at Quoted, which asserts a price
    // has already gone to the client.
    renderForm();
    const stage = screen.getByLabelText(/stage/i) as HTMLSelectElement;
    const labels = [...stage.options].map((o) => o.textContent);
    expect(labels).toContain("Enquiry");
    expect(labels.indexOf("Enquiry")).toBeLessThan(labels.indexOf("Quoted"));
  });
});

describe("ProjectForm — submitting", () => {
  it("requires a name and says so", async () => {
    const { onSubmit, user } = renderForm();
    await user.click(screen.getByRole("button", { name: /save project/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("passes the typed values through", async () => {
    const { onSubmit, user } = renderForm();
    await user.type(screen.getByLabelText(/project name/i), "Retaining wall");
    await user.click(screen.getByRole("button", { name: /save project/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Retaining wall" }),
    );
  });
});
