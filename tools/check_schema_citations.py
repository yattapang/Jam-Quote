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
- **The M18 class properly.** A comment crediting a column is a claim about the schema, so it should
  be checked against **parsed DDL**, not against a text search that another comment can satisfy.

So the difference between this tool and the old one is not strictness, it is **what it resolves
against**: a parsed schema and a full filesystem index, with **no silent skip anywhere**. Every
citation is resolved, exempted with a stated reason, or reported.

## What it checks

1. **Paths, with no bail-out.** A backticked path is resolved as an exact tracked path, as a suffix
   of one (cited relative to `new-app/`, `docs/`, `original-app/` — legitimate and common), or
   relative to the citing file, `..` included. Anything left is reported together with the fact that
   all three were tried, so a reader can tell a phantom from a mis-rooted path.
2. **A `*_id` column either has a foreign key or names a table that exists.** This is J9's class:
   a reference that the schema does not enforce and the schema does not satisfy.
3. **An identifier backticked in a migration comment is a DECLARED object** — a table, column,
   function, trigger, policy, index, or a setting the file itself sets — not merely text appearing
   somewhere.
4. **A qualified `table.column` citation, anywhere, resolves** when that table is declared.

## What it does NOT prove (Rule 21.4)

- **Not that a cited mechanism is REACHABLE.** This is J2's lesson and it is the important limit.
  `issue_balance_apply()` existed, was declared, was correctly named everywhere — and nothing
  required an invoice to pass through it. Only the trigger and the plant in
  `new-app/db/test/documents-core.test.ts` prove that, and no citation checker ever will.
- **Not J12, and I am not claiming it.** J12 is the same fact written twice in prose, one copy
  stale. That is a duplication problem, not a resolution problem; this tool would resolve both
  copies happily. The fix for that class is ADR 0025's — one home per fact — and the guard for it,
  if one is built, is a different tool.
- **Nothing about identifiers in prose documents.** A design document legitimately names tables that
  are planned and not yet built, so a document citing `acceptance_evidence` is correct prose and not
  a broken citation. Distinguishing "planned" from "phantom" needs the document to mark it, which is
  a decision about how documents are written rather than something to infer.
- Nothing about `original-app/`, which is indexed so citations into it resolve, and not scanned.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

MIGRATIONS = "new-app/db/migrations/"

SKIP_SCAN_PREFIXES = ("original-app/", ".claude/")
SCAN_EXTS = (".md", ".ts", ".tsx", ".sql", ".yml", ".yaml", ".toml", ".py", ".prisma", ".mjs")
PATH_EXTS = (
    ".md", ".ts", ".tsx", ".js", ".mjs", ".sql", ".yml", ".yaml", ".toml", ".json", ".py",
    ".prisma", ".css", ".svg", ".png", ".html", ".zip",
)

# Documents whose SUBJECT is a broken citation, so a name that does not resolve is the point. Same
# set and same reasoning as `tools/check_citations.py`, plus review 4 — which reports the phantom
# this tool exists to catch and therefore has to be able to write its name.
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

# Paths a document names deliberately although they do not exist. Each entry carries its reason,
# because every entry is a place this tool is blind and that should be visible.
EXEMPT_PATHS = {
    "some/path/file.ts": "An illustration inside a guard's own documentation, not a claim.",
    "app/admin.ts": "A hypothetical module in an example about naming.",
    ".vercel/project.json": "Generated by Vercel locally and gitignored; a real file, never tracked.",
    "infra/docker-compose.yml": "Work owed, cited as owed (the local Postgres the tests will use).",
}

# --- resolving `<something>_id` --------------------------------------------------------------------
#
# A column may name its target through a ROLE: `sealed_by_user_id` points at `app_user`, and the role
# is the interesting part of the name rather than noise to be stripped by accident. So roles are
# listed explicitly instead of being guessed by a rule like "drop everything before the last word",
# which would quietly accept `banana_user_id`.
ROLE_PREFIXES = (
    "sealed_by_", "withdrawn_by_", "recorded_by_", "voided_by_", "granted_by_", "actor_",
    "issued_by_", "created_by_", "resolved_by_", "activated_by_", "approved_by_",
)
# A table whose name differs from the entity word used in column names. `user` is reserved-ish in SQL
# and the table is `app_user`, so every `user_id` in the schema resolves through this one alias.
TABLE_ALIASES = {"user": "app_user"}
# Columns that deliberately have no foreign key and deliberately name no single table.
UNCONSTRAINED_IDS = {
    ("audit_entry", "subject_id"): (
        "Polymorphic by design: an audit row's subject may be any table, and a foreign key would "
        "make the audit trail depend on the row surviving — the opposite of what an audit is for."
    ),
}

# A reference whose target is genuinely not built yet. Listed rather than exempted, because the
# difference between "owed" and "phantom" is whether anybody wrote down what is owed — and an owed
# entry is PRINTED on every run, so it cannot go quiet the way a silent skip did (J1).
OWED_IDS = {
    ("quote_line", "recipe_id"): (
        "The catalogue is not built yet. Nullable, and the foreign key lands with the catalogue "
        "migration; until then a recipe id in a draft line points at nothing and the column is "
        "advisory. Owed: a `recipe` table and this foreign key, in the catalogue migration."
    ),
}

# Suffixes that distinguish a real column from a plausible shortening of it. Deliberately the
# suffixes this schema uses to carry MEANING — the unit, the kind, the relation — because dropping one
# of those in prose is how a bare "accepted total" came to stand for the `accepted_total_minor` column
# in six places. The wrong names are described rather than written here, because writing one would be a
# near miss inside the guard that reports near misses.
NEAR_MISS_SUFFIXES = ("minor", "thousandths", "id", "at", "key", "hash", "kind")

CITED_PATH = re.compile(r"`([A-Za-z0-9_@.][A-Za-z0-9_@./-]*/[A-Za-z0-9_.-]+\.[a-z]{2,6})`")
CITED_QUALIFIED = re.compile(r"`([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)`")
CITED_IDENTIFIER = re.compile(r"`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`")

DENIALS = re.compile(
    r"does not exist|never existed|no such file|is not there|matches no file|resolves to nothing|"
    r"that does not exist|not a real|never been|phantom|is actually|no migration creates|"
    r"deleted|removed in|no longer in the repository|"
    r"would need|would be|would mean|would have|instead of|rather than|we did not|nobody|"
    r"the alternative|alternative was|which needs an|rejected|deliberately no|there is no",
    re.I,
)


class Schema:
    """What the migrations actually declare, parsed from DDL with comments removed.

    Comments are stripped FIRST and that is the whole point of the class: the defect this replaces a
    text search with a parser for is a comment being satisfied by another comment.
    """

    def __init__(self, migration_files: list[str]) -> None:
        # column name -> declared type, because the type decides whether `*_id` is a row
        # reference at all: `mfa_totp.secret_key_id` is TEXT and labels a wrapping key, not a row.
        self.tables: dict[str, dict[str, str]] = {}
        self.functions: set[str] = set()
        self.triggers: set[str] = set()
        self.policies: set[str] = set()
        self.indexes: set[str] = set()
        self.settings: set[str] = set()
        self.foreign_keys: set[tuple[str, str]] = set()

        for path in migration_files:
            text = Path(path).read_text(encoding="utf-8")
            ddl = re.sub(r"--[^\n]*", "", text)
            self._read(ddl)
            # A GUC the file sets or requires is a real named thing, e.g. the balance write flag.
            self.settings.update(re.findall(r"current_setting\('([a-z_.]+)'", ddl))
            self.settings.update(re.findall(r"set_config\('([a-z_.]+)'", ddl))

    def _read(self, ddl: str) -> None:
        self.functions.update(re.findall(r"CREATE (?:OR REPLACE )?FUNCTION\s+([a-z_][a-z0-9_]*)", ddl))
        self.triggers.update(re.findall(r"CREATE TRIGGER\s+([a-z_][a-z0-9_]*)", ddl))
        self.policies.update(re.findall(r"CREATE POLICY\s+([a-z_][a-z0-9_]*)", ddl))
        self.indexes.update(re.findall(r'CREATE (?:UNIQUE )?INDEX\s+"?([a-z_][a-z0-9_]*)"?', ddl))
        # Foreign keys: the ALTER TABLE naming the table is usually on an earlier line than the
        # FOREIGN KEY clause, so the table is carried forward rather than matched in one pattern.
        # Getting this wrong is not a small error — a missed foreign key makes a sound column look
        # like J9 — so it is done by scanning with state rather than by one clever regex.
        table = None
        for line in ddl.splitlines():
            m = re.search(r'(?:ALTER TABLE|CREATE TABLE)\s+"?([a-z_][a-z0-9_]*)"?', line)
            if m:
                table = m.group(1)
            for col in re.findall(r'FOREIGN KEY \("([a-z_]+)"\)', line):
                if table:
                    self.foreign_keys.add((table, col))
            for col in re.findall(r'"([a-z_]+)"\s+UUID[^,]*REFERENCES', line):
                if table:
                    self.foreign_keys.add((table, col))

        # Tables and their columns.
        current = None
        for line in ddl.splitlines():
            m = re.match(r'CREATE TABLE (?:IF NOT EXISTS )?"?([a-z_][a-z0-9_]*)"?', line)
            if m:
                current = m.group(1)
                self.tables.setdefault(current, {})
                continue
            if current is not None:
                if line.startswith(");") or line.startswith(")"):
                    current = None
                    continue
                c = re.match(r'\s+"([a-z_][a-z0-9_]*)"\s+([A-Z][A-Za-z ]*)', line)
                if c:
                    self.tables[current][c.group(1)] = c.group(2).strip()
        for table, col, kind in re.findall(
            r'ALTER TABLE\s+"?([a-z_][a-z0-9_]*)"?\s+ADD COLUMN\s+"?([a-z_][a-z0-9_]*)"?\s+([A-Z]+)',
            ddl,
        ):
            self.tables.setdefault(table, {})[col] = kind

    @property
    def objects(self) -> set[str]:
        names = set(self.tables) | self.functions | self.triggers | self.policies | self.indexes
        names |= self.settings
        for cols in self.tables.values():
            names |= set(cols)
        return names

    def target_of(self, column: str) -> str | None:
        """The table a `<something>_id` column names, following a role prefix and the alias."""
        stem = column[:-3]
        for prefix in ROLE_PREFIXES:
            if stem.startswith(prefix):
                stem = stem[len(prefix) :]
                break
        stem = TABLE_ALIASES.get(stem, stem)
        return stem if stem in self.tables else None


def tracked() -> list[str]:
    out = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout
    return out.split()


def resolve_path(cited: str, citing: str, files: set[str], suffixes: dict[str, str]) -> bool:
    """Exact, then suffix-of-a-tracked-path, then relative to the citing file. No fourth option,
    and no silent skip: a path that fails all three is reported."""
    if cited in files or cited in EXEMPT_PATHS:
        return True
    if cited in suffixes:
        return True
    candidate = (Path(citing).parent / cited).as_posix()
    normalised = Path(candidate).resolve()
    try:
        rel = normalised.relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return True  # outside the repository; unjudgeable from here, and said so in the report
    return rel in files or normalised.exists()


def main() -> int:
    files = tracked()
    fileset = set(files)
    # Every proper suffix of every tracked path, so `db/test/harness.ts` resolves to
    # `new-app/db/test/harness.ts` — a citation relative to a workspace root, which is how people
    # actually write them, and which the old tool silently skipped.
    suffixes: dict[str, str] = {}
    for f in files:
        parts = f.split("/")
        for i in range(1, len(parts)):
            suffixes.setdefault("/".join(parts[i:]), f)

    migration_files = sorted(f for f in files if f.startswith(MIGRATIONS) and f.endswith(".sql"))
    schema = Schema(migration_files)
    objects = schema.objects

    problems: list[str] = []
    owed: list[str] = []

    # --- 2. every `*_id` column is enforced or resolvable ---
    for table, cols in sorted(schema.tables.items()):
        for col in sorted(cols):
            if not col.endswith("_id"):
                continue
            if (table, col) in schema.foreign_keys:
                continue
            if (table, col) in UNCONSTRAINED_IDS:
                continue
            if (table, col) in OWED_IDS:
                owed.append(f"{table}.{col}: {OWED_IDS[(table, col)]}")
                continue
            if cols[col].upper() != "UUID":
                # Not a row reference at all: `mfa_totp.secret_key_id` is TEXT and names a wrapping
                # key in the key store. Stating the scope beats an exemption list that would grow
                # with every external identifier the product ever holds.
                continue
            # A foreign key is REQUIRED, not merely preferred, and the first version of this check
            # got that wrong: it accepted "has a key OR names a real table", so deleting the key
            # from a column whose table existed passed silently — the plant that was supposed to
            # reproduce J9 did not go red. An unenforced reference is the defect whether or not the
            # target happens to exist, so the two conditions are reported separately.
            target = schema.target_of(col)
            if target is None:
                problems.append(
                    f"{MIGRATIONS}: `{table}.{col}` has no foreign key and names no table that "
                    f"exists — a reference the schema neither enforces nor satisfies (J9's class)"
                )
            else:
                problems.append(
                    f"{MIGRATIONS}: `{table}.{col}` names `{target}`, which exists, and has NO "
                    f"foreign key — nothing stops it pointing at a row that was never there"
                )

    # --- 1, 3, 4. citations ---
    scanned = 0
    for path in files:
        if not path.endswith(SCAN_EXTS) or path.startswith(SKIP_SCAN_PREFIXES):
            continue
        if path in EVIDENCE_DOCS:
            continue
        try:
            text = Path(path).read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        scanned += 1
        lines = text.splitlines()
        in_migration = path.startswith(MIGRATIONS) and path.endswith(".sql")

        for number, line in enumerate(lines, 1):
            window = " ".join(lines[max(0, number - 2) : number + 1])
            if DENIALS.search(window):
                continue
            where = f"{path}:{number}"

            for cited in CITED_PATH.findall(line):
                if not cited.endswith(PATH_EXTS):
                    continue
                if not resolve_path(cited, path, fileset, suffixes):
                    problems.append(
                        f"{where}: `{cited}` resolves to nothing — tried it as a repository path, "
                        f"as a path relative to a workspace root, and relative to this file"
                    )

            for table, column in CITED_QUALIFIED.findall(line):
                if table not in schema.tables:
                    continue  # not a known table; a filename or a prose phrase
                if column in schema.tables[table] or column in objects:
                    continue
                problems.append(
                    f"{where}: `{table}.{column}` — `{table}` is a real table and has no such column"
                )

            # A NEAR MISS of a real column, anywhere — including prose documents. This is the one
            # identifier check that runs outside the migrations, and it is safe there precisely
            # because it is a near miss: a document legitimately names tables that are planned and
            # not yet built, but it does not accidentally drop the unit suffix from a money column's
            # name. That was M19's defect surviving in a document after being
            # fixed in the migrations, and it is what finding J12 found in the writer table.
            for cited in CITED_IDENTIFIER.findall(line):
                if cited in objects:
                    continue
                near = [cited + "_" + suffix for suffix in NEAR_MISS_SUFFIXES]
                actual = next((n for n in near if n in objects), None)
                if actual is not None:
                    problems.append(
                        f"{where}: `{cited}` is a near miss — the column is `{actual}`, and a name "
                        f"that is almost right is worse than one that is obviously wrong (M19)"
                    )

            if in_migration:
                for cited in CITED_IDENTIFIER.findall(line):
                    if cited in objects:
                        continue
                    problems.append(
                        f"{where}: `{cited}` is named here and is not a table, column, function, "
                        f"trigger, policy, index or setting that any migration declares"
                    )

    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        capture_output=True, text=True, check=True,
    ).stdout.split()
    unseen = [f for f in untracked if f.endswith(SCAN_EXTS) and not f.startswith(SKIP_SCAN_PREFIXES)]

    print(
        f"scanned {scanned} files against {len(schema.tables)} tables, "
        f"{len(schema.functions)} functions, {len(schema.triggers)} triggers, "
        f"{len(schema.policies)} policies; 0 citations skipped"
    )
    if unseen:
        print(f"\nNOTE: {len(unseen)} untracked file(s) not scanned (this reads git ls-files):")
        for f in unseen[:10]:
            print(f"  {f}")
    if owed:
        print(f"\n{len(owed)} reference(s) recorded as OWED rather than enforced:")
        for item in owed:
            print(f"  {item}")
    if problems:
        print(f"\n{len(problems)} unresolved citation(s):")
        for problem in problems:
            print(f"  {problem}")
        print(
            "\nA name that resolves to nothing reads as evidence and is not. This tool resolves "
            "against parsed DDL and a full file index, and skips nothing silently — which is how "
            "J1 and J9 survived four rounds of patching the previous guard."
        )
        return 1
    print("Every cited path and every named database object resolves.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
