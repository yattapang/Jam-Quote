import { notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusPill from "@/components/ui/StatusPill";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import { PROJECT_STAGE_LABELS, projectStageTracksProgress } from "@jamquote/core";
import { quoteStatusPill } from "@/lib/status";
import {
  getProject,
  getClients,
  getQuotes,
  getPurchases,
  getPurchaseCategories,
  getLabourEntries,
  getLabourRates,
  getProjectProfit,
} from "@/lib/api-server";
import ProjectCosts from "./ProjectCosts";
import { formatJmd } from "@jamquote/core";
import EditProjectButton from "./EditProjectButton";
import shared from "../../shared.module.css";
import { formatAddress } from "@/lib/format-address";

export const metadata = { title: "Project · JamQuote" };

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const project = await getProject(params.id);
  if (!project) notFound();

  const [clients, quotes, purchases, labour, labourRates, profit, usedCategories] =
    await Promise.all([
      getClients(),
      getQuotes().then((qs) => qs.filter((q) => q.projectId === project.id)),
      getPurchases({ projectId: project.id }),
      getLabourEntries({ projectId: project.id }),
      getLabourRates(),
      getProjectProfit(project.id),
      getPurchaseCategories(),
    ]);
  const totalCents = quotes.reduce((sum, q) => sum + (q.totalCents ?? 0), 0);

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>
            <Link href="/projects" style={{ color: "inherit" }}>
              ← Jobs
            </Link>
          </span>
          <h1 className={shared.title}>{project.name}</h1>
          <span className={shared.subtitle}>
            {project.clientName} · {PROJECT_STAGE_LABELS[project.stage]}
          </span>
        </div>
        <div className={shared.headerActions}>
          <EditProjectButton project={project} clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
          <DeleteRowButton
            kind="project"
            id={project.id}
            confirmMessage={`Delete ${project.name}? This can't be undone.`}
            redirectTo="/projects"
          />
        </div>
      </header>

      <div className={shared.grid2}>
        {/* The question a contractor actually asks about a job, answered
            first. Revenue is INVOICED work, not quoted — a quote is what was
            hoped for. */}
        <section className={shared.section}>
          <div className={shared.sectionHead}>
            <h2 className={shared.sectionTitle}>Did this job make money?</h2>
          </div>
          <Card>
            {!profit ? (
              <div className={shared.empty}>Couldn&apos;t load the figures.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
                <div>
                  <div className={shared.statHint}>Invoiced</div>
                  <MoneyText cents={profit.revenueCents} size={22} />
                  <div className={shared.statHint}>{formatJmd(profit.collectedCents)} received</div>
                </div>
                <div>
                  <div className={shared.statHint}>Cost</div>
                  <MoneyText cents={profit.costExGctCents} size={22} />
                  <div className={shared.statHint}>
                    {/* The split, because "cost" alone does not say whether a
                        job overran on materials or on days. */}
                    {formatJmd(profit.labourCostCents)} labour ·{" "}
                    {formatJmd(profit.purchaseCostCents)} materials
                  </div>
                  {profit.inputTaxCents > 0 && (
                    <div className={shared.statHint}>
                      after {formatJmd(profit.inputTaxCents)} reclaimable GCT
                    </div>
                  )}
                </div>
                <div>
                  <div className={shared.statHint}>Profit</div>
                  <MoneyText
                    cents={profit.netProfitCents}
                    size={22}
                    tone={profit.netProfitCents < 0 ? "critical" : "good"}
                  />
                  <div className={shared.statHint}>
                    {/* Null, not 0 — a job with costs and no invoices has an
                        undefined margin, and "0%" would read as a fact. */}
                    {profit.marginPct === null ? "not invoiced yet" : `${profit.marginPct}% margin`}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </section>

        <section className={shared.section}>
          <div className={shared.sectionHead}>
            <h2 className={shared.sectionTitle}>Quotes</h2>
          </div>
          <Card>
            <div className={shared.list}>
              {quotes.length === 0 && <div className={shared.empty}>No quotes for this project yet.</div>}
              {quotes.map((q) => {
                const pill = quoteStatusPill(q.status);
                return (
                  <Link key={q.id} href={`/quotes/${q.id}`} className={shared.rowLink}>
                    <div className={shared.row}>
                      <div className={shared.rowMain}>
                        <span className={shared.rowTitle}>
                          {q.num}
                          <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
                        </span>
                        <span className={shared.rowSub}>{q.createdLabel}</span>
                      </div>
                      <div className={shared.rowRight}>
                        <MoneyText cents={q.totalCents ?? 0} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </section>

        <ProjectCosts
          projectId={project.id}
          purchases={purchases}
          labour={labour}
          labourRates={labourRates}
          usedCategories={usedCategories}
        />

        <section className={shared.section}>
          <Card>
            <div className={shared.statLabel}>Details</div>
            <div className={shared.list}>
              <div className={shared.totalRowMuted}>
                <span>Client</span>
                <span>{project.clientName}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>Address</span>
                <span>{project.addressLine || "—"}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>Parish</span>
                <span>{formatAddress([project.town, project.parish]) || "—"}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>Stage</span>
                <span>{PROJECT_STAGE_LABELS[project.stage]}</span>
              </div>
              {/* Same rule as the list: the stored percentage is kept, but a
                  cancelled or not-yet-won project showing "40%" reads as a bug. */}
              {projectStageTracksProgress(project.stage) && (
                <div className={shared.totalRowMuted}>
                  <span>Progress</span>
                  <span>{project.progressPct}% complete</span>
                </div>
              )}
              <div className={shared.totalRowGrand}>
                <span>Total quoted</span>
                <MoneyText cents={totalCents} tone="accent" />
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
