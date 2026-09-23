-- LabourRate and EquipmentItem gain a free-text unit label, so labour and
-- plant can be priced per sq ft.
--
-- Reported on both the Labour and Equipment screens: "the unit dropdown
-- won't let me add a new unit". It cannot: rateUnit is the RateUnit Postgres enum (HOUR/DAY/WEEK/
-- MONTH/JOB/UNIT), which is a closed, platform-wide vocabulary. A contractor
-- adding "sq ft" to it would be altering an enum shared by every tenant.
--
-- But the need underneath is real and currently unmet. A painter charges
-- labour by the square foot, a glazier by the window, a carpenter by the
-- door. None of those are cadences, and today the only honest choice is UNIT
-- — after which the customer's quote reads "120 unit", which is not what
-- anyone agreed to.
--
-- This is the same shape materials already solved. A material carries a
-- coarse rateUnit AND a `unitLabel` snapshot of how it is actually sold
-- ("bag"), and the document prints the label. Labour had no equivalent, so
-- there was nowhere to put "sq ft". Adding one here means the enum stays
-- closed (no migration to sell labour by the window) while the vocabulary a
-- contractor prints is theirs.
--
-- Additive and nullable: every existing row keeps its cadence and prints
-- exactly as it does today. NULL means "no override — print the rateUnit",
-- which is the behaviour lineUnitLabel already implements for quote lines.
ALTER TABLE "LabourRate" ADD COLUMN "unitLabel" TEXT;

-- Equipment has the same closed-enum problem for the same reason. Scaffold
-- rented by the week fits RateUnit; scaffold priced per lift, or a pump per
-- cubic metre pumped, does not.
ALTER TABLE "EquipmentItem" ADD COLUMN "unitLabel" TEXT;
