-- AlterTable
ALTER TABLE "policies" ADD COLUMN "procedureCaps" JSONB,
ADD COLUMN "nonNetworkPct" DOUBLE PRECISION,
ADD COLUMN "parentCopayPct" DOUBLE PRECISION;
