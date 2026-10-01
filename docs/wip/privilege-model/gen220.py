from pathlib import Path
M = Path("migrations")
def fn(path, name):
    s = (M / path / "migration.sql").read_text()
    start = s.index(f"FUNCTION {name}(")
    start = s.rindex("\n", 0, start) + 1
    end = s.index("$$;", s.index("$$", start) + 2) + 3
    return s[start:end]
open_fn = fn("20260927130000_balance_open_takes_lock", "issue_balance_open")
apply_fn = fn("20260927120000_lock_isolation_and_tenancy", "issue_balance_apply")
def strip_flag(body):
    out = []
    for line in body.splitlines():
        if "balance_write" in line or "The flag goes up before the lock" in line:
            continue
        out.append(line)
    b = "\n".join(out)
    b = b.replace("LANGUAGE plpgsql AS $$", "LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$", 1)
    assert "SECURITY DEFINER" in b
    return b
open_fn, apply_fn = strip_flag(open_fn), strip_flag(apply_fn)

HEAD = Path("/tmp/claude-0/-home-user-Jam-Quote/869eaeec-bb45-5122-8588-088514c4bb95/scratchpad/m220_head.sql").read_text()
DOORS = Path("/tmp/claude-0/-home-user-Jam-Quote/869eaeec-bb45-5122-8588-088514c4bb95/scratchpad/m220_doors.sql").read_text()
TAIL = Path("/tmp/claude-0/-home-user-Jam-Quote/869eaeec-bb45-5122-8588-088514c4bb95/scratchpad/m220_tail.sql").read_text()
POL = Path("policies/006-privilege-model.sql").read_text().rstrip("\n")
body = (HEAD
  + "\n-- ---------------------------------------------------------------------------\n-- 3. The balance functions run as `pryvis_balance`, without the flag. Otherwise unchanged from\n--    `20260927130000_balance_open_takes_lock` and `20260927120000_lock_isolation_and_tenancy`.\n-- ---------------------------------------------------------------------------\n"
  + open_fn + "\n\n" + apply_fn + "\n\n"
  + "ALTER FUNCTION issue_balance_open(uuid) OWNER TO pryvis_balance;\nALTER FUNCTION issue_balance_apply(uuid) OWNER TO pryvis_balance;\n\n"
  + "-- ---------------------------------------------------------------------------\n-- 4. `issue_balance`'s write policies, keyed on the owning role.\n-- ---------------------------------------------------------------------------\n"
  + "-- >>> BEGIN db/policies/006-privilege-model.sql\n" + POL + "\n-- <<< END db/policies/006-privilege-model.sql\n\n"
  + DOORS + TAIL)
out = M / "20260927220000_privilege_model"
out.mkdir(exist_ok=True)
(out / "migration.sql").write_text(body)
print("written", len(body.splitlines()), "lines")
