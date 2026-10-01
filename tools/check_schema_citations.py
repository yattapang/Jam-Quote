"""Every cited path and every named database object is resolved against what actually exists.

## Why this exists, and why it is a NEW tool rather than a fifth patch to `check_citations.py`

Review 4 made a structural criticism I accept: four mechanisms had been built and each aimed at the
instance rather than the class. `check_citations.py` was patched after M14, after H16, after M18 and
after M19, and review 4 then found three defects it could not see **by construction**:

- **J1.** It skipped, in silence, any cited path whose first segment was not a real top-level
  directory. 71 distinct paths were never checked. Most were legitimate — cited relative to
  `new-app/` or to `original-app/` — and hidden among them were five phantoms, including
  `db/test/money-convention.test.ts`, credited at **eight** sites as the guard that keeps money
  columns `BIGINT`. A guard that says "Every cited path resolves" while skipping 71 paths is the
  green tick Rule 21 opens by forbidding.
- **J9.** `acceptance` carries a `document_render_id` column, with no foreign key, naming a table no
  migration creates. The old guard checked that a backticked identifier appeared *as text somewhere
  in the migrations* — and `document_render` does appear, in the column name and in comments. Text
  presence is not existence.

## What it resolves against — and why that changed on 2026-10-01 (findings S3, S4; Rule 21.9)

This tool used to learn the schema by **parsing the migrations' SQL** with regular expressions. Two
reviews in a row found that parse wrong in the same way: first it skipped every NOT NULL column (R3),
then its fix missed ordinary DDL that PostgreSQL accepts — `ALTER TABLE IF EXISTS`, a lower-case
type, `ADD` without COLUMN, a multi-clause DROP — and it never forgot a dropped index (S3, S4). Two
misses of one class mean the shape is the defect, so the parser is gone:

- **What exists** comes from `new-app/db/schema-objects.json`, generated from PostgreSQL's catalogue
  after every migration by `new-app/db/test/schema-objects.test.ts`, which fails if the committed file
  differs from what the migrations build. A dropped object leaves the catalogue, so it leaves the file.
- **"Every row reference has a key"** moved out of this tool entirely, into
  `new-app/db/test/reference-keys.test.ts`, which asks the catalogue directly.
- Only **settings** (GUCs such as the balance-write flag) are still read from the SQL text, because they
  are not catalogue objects: a name in a `current_setting(...)` or `set_config(...)` call.

## What it checks — exactly these forms, and only in files it scans

1. **Paths.** A backticked token containing a slash and ending in a listed extension (any case), with an
   optional `#anchor`, `:12`, `:12-20`, `:12:5` or `:L12` suffix; or a backticked token ending in `/` (a
   directory). Resolved as an exact tracked path, as a suffix of one, or relative to the citing file. A
   file inside new-app/ does not resolve through original-app/'s copy of the same tail (T12). A path that
   climbs out of the repository is reported (S2).
2. **In a migration comment:** a backticked identifier containing an underscore, in any case, must be a
   table, column, function, trigger, policy, index, constraint, sequence, type, schema or setting in the
   catalogue the migrations build; and a backticked call, `name()` or `name(args)`, must be a function
   the migrations create, a PostgreSQL built-in, or one of the SQL constructs named in SQL_CONSTRUCTS.
3. **Anywhere:** a backticked `table.column` whose table exists must name a column of THAT table; a
   backticked `public.name` must name an object; a backticked setting-shaped name (one dot, a prefix that
   a real setting uses, an underscore after the dot) must be a setting a migration reads or sets.
4. **Anywhere:** a near miss of a real column — the unit or kind suffix dropped.

Anything matching those forms is resolved, exempted by (file, citation) with a printed reason, or
reported. What it does not scan is listed on every run: original-app/ and .claude/ with their file and
path-citation counts, and the eight evidence documents with theirs (S5, T3). An exemption that excuses
nothing fails the run.

## What it does NOT check (Rule 21.4) — stated so "clean" is not read as "complete"

- **Citation forms outside the list above**, which pass silently: a path with no slash, or no extension
  and no trailing slash (`tools/never_written`, a directory written without its `/`); an extension not in
  PATH_EXTS; a single-word identifier with no underscore (`nevertable`); a call or identifier in a prose
  document rather than a migration comment; anything not in backticks. A regular expression over free
  text cannot recognise every way a claim is written (T1, T2); these are the stated limits.
- **Not that a cited mechanism is REACHABLE.** This is J2's lesson and it is the important limit.
  `issue_balance_apply()` existed, was declared, was correctly named everywhere — and nothing
  required an invoice to pass through it. Only the trigger and the plant in
  `new-app/db/test/documents-core.test.ts` prove that, and no citation checker ever will.
- **Not that a sentence is true.** J12, S7 and T10 were true names in false sentences.
- **Nothing about identifiers in prose documents** beyond near misses, `table.column`, `public.name` and
  settings: a design document legitimately names tables that are planned and not yet built.
- **Bare filenames** are `tools/check_citations.py`'s job.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

MIGRATIONS = "new-app/db/migrations/"
OBJECTS_FILE = "new-app/db/schema-objects.json"

SKIP_SCAN_PREFIXES = ("original-app/", ".claude/")
SCAN_EXTS = (".md", ".ts", ".tsx", ".sql", ".yml", ".yaml", ".toml", ".py", ".prisma", ".mjs")
PATH_EXTS = (
    ".md", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".yml", ".yaml", ".toml", ".json",
    ".py", ".sh", ".txt", ".prisma", ".css", ".svg", ".png", ".html", ".zip", ".example", ".lock",
)

# Documents whose SUBJECT is a broken citation, so a name that does not resolve is the point. Same
# set and same reasoning as `tools/check_citations.py`, plus review 4 — which reports the phantom
# this tool exists to catch and therefore has to be able to write its name. Not scanned, and COUNTED
# in the report (S5): a skip the banner does not mention is R11's defect.
EVIDENCE_DOCS = {
    "REVIEW-FINDINGS.md": "Closed register about original-app; its paths are history.",
    "docs/COMPLIANCE-REVIEW.md": "The same, for the compliance pass.",
    "docs/PRD-REVIEW.md": "A review register: naming a broken citation is its job.",
    "docs/PRD-REVIEW-2.md": "The same.",
    "docs/PRD-REVIEW-3.md": "The same.",
    "docs/PRD-REVIEW-4.md": "The same, and it is the review that reported J1 and J9.",
    "docs/MISTAKES.md": "The ledger records the phantom name as the lesson (M14, H16).",
    "docs/RULES-ENFORCEMENT-AUDIT.md": "Cites the phantom as the evidence for this very guard.",
}

# Suffixes that distinguish a real column from a plausible shortening of it. Deliberately the
# suffixes this schema uses to carry MEANING — the unit, the kind, the relation — because dropping one
# of those in prose is how a bare "accepted total" came to stand for the `accepted_total_minor` column
# in six places. The wrong names are described rather than written here, because writing one would be a
# near miss inside the guard that reports near misses.
NEAR_MISS_SUFFIXES = ("minor", "thousandths", "id", "at", "key", "hash", "kind")

# A path with a slash and an extension, optionally `:line` or `:from-to` (S2: a line suffix used to
# defeat the match entirely); and, separately, a directory, which ends in a slash.
CITED_PATH = re.compile(
    r"`([A-Za-z0-9_@.][A-Za-z0-9_@./-]*/[A-Za-z0-9_.-]+\.[A-Za-z]{1,8})"
    # T2: a `#anchor`, `:12`, `:12-20`, `:12:5` or `:L12` suffix no longer defeats the match.
    r"(?:#[^`]*|:L?\d+(?::\d+)?(?:-L?\d+)?)?`"
)
CITED_DIR = re.compile(r"`([A-Za-z0-9_@.][A-Za-z0-9_@./-]*/)`")
CITED_QUALIFIED = re.compile(r"`([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)`")
CITED_IDENTIFIER = re.compile(r"`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`")
# In a migration comment, any case: PostgreSQL folds an unquoted name to lower case, and this schema has
# no quoted mixed-case names, so `Never_Index` is checked as never_index (T1).
CITED_IDENTIFIER_ANY_CASE = re.compile(r"`([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+)`")
# A function cited as a call, `name()` or `name(args)` — the form every migration uses (T1).
CITED_CALL = re.compile(r"`([A-Za-z_][A-Za-z0-9_]*)\([^`]*\)`")
# A dotted name: a setting such as `pryvis.balance_write`, or a schema-qualified `public.name` (T1).
CITED_DOTTED = re.compile(r"`([a-z][a-z0-9_]*)\.([a-z][a-z0-9_.]*)`")

# Citations that are deliberately to something absent, keyed by (citing file, citation) — not by a
# phrase near them (finding R11) and not by line number, which moves with every edit above it. Every
# entry is printed on every run, and an entry that stops matching a failing citation fails the run.
# Written like calls, but SQL syntax rather than functions, so no catalogue lists them.
SQL_CONSTRUCTS = {
    "greatest": "SQL conditional expression, not a catalogue function.",
    "least": "SQL conditional expression, not a catalogue function.",
    "nullif": "SQL conditional expression, not a catalogue function.",
    "coalesce": "SQL conditional expression, not a catalogue function.",
}

CITATION_EXEMPTIONS: dict[tuple[str, str], str] = {
    ("new-app/db/migrations/20260926190000_balance_write_is_checked/migration.sql", "row_count"): (
        "PL/pgSQL's GET DIAGNOSTICS item, not a schema object. A committed migration (Rule 6)."
    ),
    ("docs/ARCHITECTURE.md", "extracted/JamQuote.dc.html"): "The same deleted mockup, the same history.",
    ("new-app/db/migrations/20260925120000_documents_core/migration.sql", "withdrawn_at"): (
        "Names the design ADR 0025 rejected (a nullable column on acceptance), to say why it was "
        "rejected. A committed migration, so Rule 6 forbids rewording it."
    ),
    ("new-app/db/migrations/20260926180000_tenant_composite_keys/migration.sql", "acceptance_issue_key"): (
        "True when committed; J13's migration 20260927160000 dropped the index. S3's class exactly — "
        "the old parser still counted it — and Rule 6 forbids rewording a committed migration."
    ),
    ("DEPLOYMENT.md", ".vercel/project.json"): (
        "Cited to say it is NOT checked in (\"no checked-in .vercel/project.json\"): the absence is the "
        "point. Not gitignored — finding T4 corrected an earlier reason that said it was."
    ),
    ("docs/adr/0012-new-app-structure.md", "infra/docker-compose.yml"): (
        "Cited as planned, not built (the ADR sentence was corrected for finding T4, which found it "
        "said the file exists)."
    ),
    ("docs/DEVELOPMENT-BRIEF.md", "catalog/"): "A planned module directory in the brief's target layout.",
    ("docs/DEVELOPMENT-BRIEF.md", "messaging/"): "A planned module directory in the brief's target layout.",
    ("docs/DEVELOPMENT-BRIEF.md", "support/"): "A planned module directory in the brief's target layout.",
    ("docs/DEVELOPMENT-BRIEF.md", "infra/"): "Planned: infrastructure as code is not built.",
    ("docs/PRICING.md", "apps/api/src/pricing/scrapers/"): (
        "The supplier-scraper spec's planned location, in the earlier application's layout; not built."
    ),
    ("docs/SERVICE-REGISTER.md", "new-app/infra/"): "Planned: infrastructure as code is not built.",
    ("new-app/CLAUDE.md", "infra/"): "Listed there as not built yet.",
    ("new-app/README.md", "infra/"): "Planned layout; not built.",
    ("new-app/CLAUDE.md", "mobile/"): (
        "Listed there as not built yet. Resolved, until T12, to original-app's mobile folder — a phantom."
    ),
    ("new-app/README.md", "mobile/"): "Planned layout; not built. The same T12 case.",
}


class Schema:
    """What exists, read from the generated catalogue list — never parsed out of SQL (S3, S4)."""

    def __init__(self, migration_files: list[str]) -> None:
        try:
            data = json.loads(Path(OBJECTS_FILE).read_text(encoding="utf-8"))
        except FileNotFoundError:
            sys.exit(
                f"{OBJECTS_FILE} is missing. Generate it: in new-app/db, "
                f"PRYVIS_WRITE_SCHEMA_OBJECTS=1 npx vitest run test/schema-objects.test.ts"
            )
        self.tables: dict[str, set[str]] = {t: set(cols) for t, cols in data["tables"].items()}
        self.functions: set[str] = set(data["functions"])
        self.triggers: set[str] = set(data["triggers"])
        self.policies: set[str] = set(data["policies"])
        self.indexes: set[str] = set(data["indexes"])
        self.constraints: set[str] = set(data["constraints"])
        self.builtin_functions: set[str] = set(data["builtin_functions"])
        # Settings are not catalogue objects, so they are the one thing still read from the SQL: a GUC
        # the migrations set or require is a real named thing, e.g. the balance-write flag.
        self.settings: set[str] = set()
        for path in migration_files:
            ddl = re.sub(r"--[^\n]*", "", Path(path).read_text(encoding="utf-8"))
            self.settings.update(re.findall(r"current_setting\('([a-z_.]+)'", ddl))
            self.settings.update(re.findall(r"set_config\('([a-z_.]+)'", ddl))

    @property
    def objects(self) -> set[str]:
        names = set(self.tables) | self.functions | self.triggers | self.policies | self.indexes
        names |= self.constraints | self.settings
        for cols in self.tables.values():
            names |= cols
        return names


def tracked() -> list[str]:
    out = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout
    return out.split()


def resolve(cited: str, citing: str, known: set[str], suffixes: set[str]) -> str | None:
    """None if `cited` resolves — exactly, as a suffix of a tracked path, or relative to the citing
    file — and otherwise why not. A path that climbs out of the repository is NOT resolved (S2): it
    used to return True here under a comment claiming the report said so, and the report did not."""
    if cited in known or cited in suffixes:
        return None
    root = Path.cwd().resolve()
    normalised = (root / Path(citing).parent / cited).resolve()
    try:
        rel = normalised.relative_to(root).as_posix()
    except ValueError:
        return "climbs out of the repository, where nothing can vouch for it"
    if rel in known or (rel + "/") in known:
        return None
    return "tried it as a repository path, as a path relative to a workspace root, and relative to this file"


def main() -> int:
    files = tracked()
    # Tracked files, and every tracked directory written with a trailing slash.
    known: set[str] = set(files)
    for f in files:
        parts = f.split("/")
        for i in range(1, len(parts)):
            known.add("/".join(parts[:i]) + "/")
    # Every proper suffix of everything known, so `db/test/harness.ts` resolves to
    # `new-app/db/test/harness.ts` — a citation relative to a workspace root, which is how people
    # actually write them, and which the old tool silently skipped.
    suffixes: set[str] = set()
    # The same, from everything EXCEPT the frozen original-app/. A file inside new-app/ means new-app's
    # own files when it cites `packages/core/...`; resolving that to original-app's copy of the same
    # tail passed a phantom (finding T12). Citations elsewhere may still mean the earlier application.
    new_app_suffixes: set[str] = set()
    for k in known:
        parts = k.rstrip("/").split("/")
        tail = "/" if k.endswith("/") else ""
        for i in range(1, len(parts)):
            suffixes.add("/".join(parts[i:]) + tail)
            if not k.startswith("original-app/"):
                new_app_suffixes.add("/".join(parts[i:]) + tail)

    migration_files = sorted(f for f in files if f.startswith(MIGRATIONS) and f.endswith(".sql"))
    schema = Schema(migration_files)
    objects = schema.objects
    setting_prefixes = {s.split(".", 1)[0] for s in schema.settings}

    problems: list[str] = []
    exempted: list[str] = []
    exemptions_used: set[tuple[str, str]] = set()

    def report(path: str, cited: str, problem: str) -> None:
        """Records a problem unless an explicit, reasoned exemption names this citation here."""
        if (path, cited) in CITATION_EXEMPTIONS:
            exemptions_used.add((path, cited))
            exempted.append(f"{path}: `{cited}` — {CITATION_EXEMPTIONS[(path, cited)]}")
            return
        problems.append(problem)

    scanned = 0
    evidence_skipped: list[str] = []
    # T3: whole trees not scanned are counted in the report too, not only the evidence documents.
    prefix_skipped = {prefix: [0, 0] for prefix in SKIP_SCAN_PREFIXES}
    for path in files:
        if not path.endswith(SCAN_EXTS):
            continue
        try:
            text = Path(path).read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        if path.startswith(SKIP_SCAN_PREFIXES):
            counts = prefix_skipped[next(p for p in SKIP_SCAN_PREFIXES if path.startswith(p))]
            counts[0] += 1
            counts[1] += len(CITED_PATH.findall(text)) + len(CITED_DIR.findall(text))
            continue
        if path in EVIDENCE_DOCS:
            n = len(CITED_PATH.findall(text)) + len(CITED_DIR.findall(text))
            evidence_skipped.append(f"{path} ({n} path citations): {EVIDENCE_DOCS[path]}")
            continue
        scanned += 1
        in_migration = path.startswith(MIGRATIONS) and path.endswith(".sql")

        # No line is skipped for what the sentence around it says (finding R11). A citation that is
        # deliberately to something absent is in CITATION_EXEMPTIONS with its reason, printed below.
        for number, line in enumerate(text.splitlines(), 1):
            where = f"{path}:{number}"

            cited_paths = [c for c in CITED_PATH.findall(line) if c.lower().endswith(PATH_EXTS)]
            for cited in cited_paths + CITED_DIR.findall(line):
                why = resolve(cited, path, known, new_app_suffixes if path.startswith("new-app/") else suffixes)
                if why is not None:
                    report(path, cited, f"{where}: `{cited}` resolves to nothing — {why}")

            for table, column in CITED_QUALIFIED.findall(line):
                if table not in schema.tables:
                    continue  # not a known table; a filename or a prose phrase
                # The column must be on THAT table. "or anywhere in the schema" passed a real table cited
                # with another table's column — the quote table with the accepted total (T1).
                if column in schema.tables[table]:
                    continue
                report(
                    path, f"{table}.{column}",
                    f"{where}: `{table}.{column}` — `{table}` is a real table and has no such column",
                )

            # A NEAR MISS of a real column, anywhere — including prose documents. Safe outside the
            # migrations precisely because it is a near miss: a document legitimately names planned
            # tables, but it does not accidentally drop the unit suffix from a money column's name
            # (M19; J12's writer table; R11's hidden R1.24b).
            for cited in CITED_IDENTIFIER.findall(line):
                if cited in objects:
                    continue
                near = [cited + "_" + suffix for suffix in NEAR_MISS_SUFFIXES]
                actual = next((n for n in near if n in objects), None)
                if actual is not None:
                    report(
                        path, cited,
                        f"{where}: `{cited}` is a near miss — the column is `{actual}`, and a name "
                        f"that is almost right is worse than one that is obviously wrong (M19)",
                    )

            # A setting is checked wherever it is cited: real settings always carry a dot, so the
            # identifier checks above could never reach one (T1). A `public.name` is checked as name.
            for head, tail in CITED_DOTTED.findall(line):
                dotted = f"{head}.{tail}"
                if head == "public" and tail not in objects:
                    report(path, dotted, f"{where}: `{dotted}` — no object `{tail}` in the schema the migrations build")
                elif (head in setting_prefixes and "." not in tail and "_" in tail
                      and dotted not in schema.settings):
                    report(path, dotted, f"{where}: `{dotted}` is not a setting any migration reads or sets")

            if in_migration:
                for name in CITED_CALL.findall(line):
                    if name.lower() not in schema.functions and name.lower() not in schema.builtin_functions \
                            and name.lower() not in SQL_CONSTRUCTS:
                        report(
                            path, name,
                            f"{where}: `{name}()` is cited as a function and no migration creates it",
                        )
                for cited in CITED_IDENTIFIER_ANY_CASE.findall(line):
                    cited = cited.lower()
                    if cited in objects:
                        continue
                    report(
                        path, cited,
                        f"{where}: `{cited}` is named here and is not a table, column, function, "
                        f"trigger, policy, index, constraint or setting in the schema the migrations build",
                    )

    # An exemption that no longer matches a failing citation is a comment pretending to be a
    # decision: the text was fixed, moved or deleted, and the entry would excuse the next mistake.
    for key in sorted(set(CITATION_EXEMPTIONS) - exemptions_used):
        problems.append(
            f"CITATION_EXEMPTIONS: `{key[1]}` in {key[0]} no longer needs an exemption — "
            f"remove the entry"
        )

    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        capture_output=True, text=True, check=True,
    ).stdout.split()
    unseen = [f for f in untracked if f.endswith(SCAN_EXTS) and not f.startswith(SKIP_SCAN_PREFIXES)]

    print(
        f"scanned {scanned} files against the catalogue list ({len(schema.tables)} tables, "
        f"{len(schema.functions)} functions, {len(schema.triggers)} triggers, {len(schema.policies)} "
        f"policies, {len(schema.indexes)} indexes, {len(schema.constraints)} constraints); "
        f"{len(exempted)} citation(s) exempted by name; {len(evidence_skipped)} evidence document(s) "
        f"not scanned, listed below"
    )
    print("\nNot scanned, by scope:")
    print(f"  original-app/: {prefix_skipped['original-app/'][0]} files, {prefix_skipped['original-app/'][1]} "
          f"path citations — frozen; indexed so citations INTO it resolve, never scanned")
    print(f"  .claude/: {prefix_skipped['.claude/'][0]} files, {prefix_skipped['.claude/'][1]} path citations — "
          f"agent briefs that cite paths relative to the earlier application's root")
    print(f"\n{len(evidence_skipped)} evidence document(s) not scanned, by purpose (Rule 21.8):")
    for item in evidence_skipped:
        print(f"  {item}")
    if exempted:
        print(f"\n{len(exempted)} citation(s) exempted, each with its reason:")
        for item in exempted:
            print(f"  {item}")
    if unseen:
        print(f"\nNOTE: {len(unseen)} untracked file(s) not scanned (this reads git ls-files):")
        for f in unseen[:10]:
            print(f"  {f}")
    if problems:
        print(f"\n{len(problems)} unresolved citation(s):")
        for problem in problems:
            print(f"  {problem}")
        print(
            "\nA name that resolves to nothing reads as evidence and is not. This tool resolves "
            "against the catalogue the migrations build and a full file index, and states everything "
            "it does not scan."
        )
        return 1
    print("\nEvery cited path and every named database object resolves.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
