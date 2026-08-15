import { describe, expect, it } from "vitest";
import { demoJobs } from "../fixtures/demo.js";
import { ProjectStage, PROJECT_STAGES, PROJECT_STAGE_LABELS, projectStageTracksProgress } from "./enums.js";

describe("ProjectStage", () => {
  it("labels every stage, so no surface can render a raw enum value", () => {
    for (const stage of PROJECT_STAGES) {
      expect(PROJECT_STAGE_LABELS[stage]).toBeTruthy();
      expect(PROJECT_STAGE_LABELS[stage]).not.toBe(stage);
    }
  });

  it("has no INVOICED or PAID member", () => {
    // Billing state lives on Invoice.status. Duplicating it here would give
    // the same fact two homes, and they would eventually disagree — which is
    // exactly why the migration maps legacy 'Invoiced' onto WON.
    expect(PROJECT_STAGES).not.toContain("INVOICED" as ProjectStage);
    expect(PROJECT_STAGES).not.toContain("PAID" as ProjectStage);
  });

  it("tracks progress only while there is committed work under way", () => {
    expect(projectStageTracksProgress(ProjectStage.WON)).toBe(true);
    expect(projectStageTracksProgress(ProjectStage.IN_PROGRESS)).toBe(true);
    // QUOTED: nothing has been committed for a percentage to be OF.
    expect(projectStageTracksProgress(ProjectStage.QUOTED)).toBe(false);
    // COMPLETE: done by definition — a stale 62% would contradict the stage.
    expect(projectStageTracksProgress(ProjectStage.COMPLETE)).toBe(false);
    // CANCELLED: "40% complete" on a stopped job reads as a bug.
    expect(projectStageTracksProgress(ProjectStage.CANCELLED)).toBe(false);
  });

  it("keeps the demo fixtures on real stages", () => {
    // The fixtures are what prisma/seed.ts writes, so a stray free-text stage
    // here would fail the seed against the enum column rather than at review.
    for (const job of demoJobs) {
      expect(PROJECT_STAGES).toContain(job.stage);
      expect(job.progressPct).toBeGreaterThanOrEqual(0);
      expect(job.progressPct).toBeLessThanOrEqual(100);
    }
  });
});
