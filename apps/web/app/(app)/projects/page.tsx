import Link from "next/link";
import { projectStageTracksProgress } from "@jamquote/core";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusPill from "@/components/ui/StatusPill";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import { projectStagePill } from "@/lib/status";
import { getProjects, getClients } from "@/lib/api-server";
import AddProjectButton from "./AddProjectButton";
import shared from "../shared.module.css";

export const metadata = { title: "Projects · JamQuote" };

export default async function ProjectsPage() {
  const [projects, clients] = await Promise.all([getProjects(), getClients()]);
  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Work</span>
          <h1 className={shared.title}>Projects</h1>
          <span className={shared.subtitle}>{projects.length} active projects</span>
        </div>
        <div className={shared.headerActions}>
          <AddProjectButton clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
        </div>
      </header>

      <Card>
        <div className={shared.list}>
          {projects.length === 0 && (
            <div className={shared.empty}>No projects yet — add one to get started.</div>
          )}
          {projects.map((project) => {
            const pill = projectStagePill(project.stage);
            return (
              <div key={project.id} className={shared.row}>
                <div className={shared.rowMain}>
                  {/* Title + stage pill, the same row shape the quotes and
                      invoices lists use — the stage used to be plain grey text
                      here, which read as an afterthought rather than status. */}
                  <span className={shared.rowTitle}>
                    <Link href={`/projects/${project.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      {project.name}
                    </Link>
                    <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
                  </span>
                  <span className={shared.rowSub}>
                    {project.clientName} · {project.addressLine}
                  </span>
                  {/* Progress belongs on the LIST: someone checking several
                      jobs should not have to open each one. Muted text in the
                      existing sub-line rather than a bar — no other list screen
                      draws one, and an empty track at 0% reads as broken when 0
                      is simply where every job starts. Hidden at stages where
                      the number would mislead (projectStageTracksProgress). */}
                  {projectStageTracksProgress(project.stage) && (
                    <span className={shared.rowSub}>{project.progressPct}% complete</span>
                  )}
                </div>
                <div className={shared.rowRight}>
                  <MoneyText cents={project.valueCents} />
                  <span className={shared.rowSub}>
                    {project.quoteCount} {project.quoteCount === 1 ? "quote" : "quotes"}
                  </span>
                  <DeleteRowButton
                    kind="project"
                    id={project.id}
                    confirmMessage={`Delete ${project.name}? This can't be undone.`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
