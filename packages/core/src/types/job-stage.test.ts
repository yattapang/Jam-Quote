import { describe, expect, it } from "vitest";
import { demoJobs } from "../fixtures/demo.js";
import { JobStage, JOB_STAGES, JOB_STAGE_LABELS, jobStageTracksProgress } from "./enums.js";

describe("JobStage", () => {
  it("labels every stage, so no surface can render a raw enum value", () => {
    for (const stage of JOB_STAGES) {
      expect(JOB_STAGE_LABELS[stage]).toBeTruthy();
      expect(JOB_STAGE_LABELS[stage]).not.toBe(stage);
    }
  });

  it("has no INVOICED or PAID member", () => {
    // Billing state lives on Invoice.status. Duplicating it here would give
    // the same fact two homes, and they would eventually disagree — which is
    // exactly why the migration maps legacy 'Invoiced' onto WON.
    expect(JOB_STAGES).not.toContain("INVOICED" as JobStage);
    expect(JOB_STAGES).not.toContain("PAID" as JobStage);
  });

  it("tracks progress only while there is committed work under way", () => {
    expect(jobStageTracksProgress(JobStage.WON)).toBe(true);
    expect(jobStageTracksProgress(JobStage.IN_PROGRESS)).toBe(true);
    // QUOTED: nothing has been committed for a percentage to be OF.
    expect(jobStageTracksProgress(JobStage.QUOTED)).toBe(false);
    // COMPLETE: done by definition — a stale 62% would contradict the stage.
    expect(jobStageTracksProgress(JobStage.COMPLETE)).toBe(false);
    // CANCELLED: "40% complete" on a stopped job reads as a bug.
    expect(jobStageTracksProgress(JobStage.CANCELLED)).toBe(false);
  });

  it("keeps the demo fixtures on real stages", () => {
    // The fixtures are what prisma/seed.ts writes, so a stray free-text stage
    // here would fail the seed against the enum column rather than at review.
    for (const job of demoJobs) {
      expect(JOB_STAGES).toContain(job.stage);
      expect(job.progressPct).toBeGreaterThanOrEqual(0);
      expect(job.progressPct).toBeLessThanOrEqual(100);
    }
  });
});
