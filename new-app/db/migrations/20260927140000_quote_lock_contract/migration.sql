-- The quote lock's contract, recorded where the database itself shows it, and the last uncorrected copy of
-- a false sentence corrected (the J4 closing check, finding 5a).
--
-- ## THE SENTENCE
--
-- `20260927110000_one_lock_per_quote` says, in its FIX section: "the order is always quote lock, then
-- balance row lock, so no single-quote cycle exists." Both halves were false when written. The order was
-- not always kept — `issue_balance_apply()` took the row lock without the quote lock until
-- `20260927120000_lock_isolation_and_tenancy` (P3). And even with the order kept, a transaction that holds
-- a quote's SHARED lock and then seals the same quote asks for the EXCLUSIVE lock, which deadlocks against
-- another shared holder (Q2). `20260927130000_balance_open_takes_lock` corrected the copy of this sentence
-- in `20260927120000`; the closing check found the original, here, still standing. Rule 6 forbids editing
-- it, so the correction is this migration, and it names the file it corrects.
--
-- ## WHY A COMMENT ON THE FUNCTION
--
-- A correction that lives only in a later migration's header is found by reading history in order, which
-- is how three copies of one false sentence survived five reviews. `COMMENT ON FUNCTION` puts the lock's
-- contract on the object itself, where `\df+` and any schema browser show it, so the next reader meets the
-- true statement first.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It changes no behaviour. The comment is documentation the database stores; nothing enforces it.
-- - It does not remove the false sentence from `20260927110000_one_lock_per_quote`, which Rule 6 keeps.

COMMENT ON FUNCTION quote_money_lock(UUID, BOOLEAN) IS
'Per-quote advisory lock for financial writes (docs/design/scope-reduction.md section 3c). '
'Exclusive for a seal, shared for acceptance, invoice, void, credit note, variation, withdrawal, '
'opening a balance row and a balance recompute; always taken before the issue''s balance row lock. '
'Refuses to run outside READ COMMITTED (SQLSTATE 25000). Locks only a quote visible under row security; '
'the key is 64 bits of md5(quote id). Deadlocks that remain, detected as SQLSTATE 40P01 and to be retried: '
'a transaction writing on two quotes, and one that writes on a quote and then seals the same quote. '
'Not closed at the SQL level: any session can call pg_advisory_* with the key (THREAT-MODEL 4d).';
