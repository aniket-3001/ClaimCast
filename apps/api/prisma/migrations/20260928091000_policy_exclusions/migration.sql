-- Exclusions, read off the schedule with the other fields and confirmed by the
-- user. Null where no document has been read for the policy.
ALTER TABLE "policies" ADD COLUMN "exclusions" TEXT;
