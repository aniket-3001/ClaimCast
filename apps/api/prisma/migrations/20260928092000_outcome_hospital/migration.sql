-- Settled bills record which hospital the admission was at, so an outcome is
-- (procedure, hospital, city, forecast, actual). Recorded, not priced from.
ALTER TABLE "forecast_outcomes" ADD COLUMN "hospitalId" TEXT;
