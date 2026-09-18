-- CreateEnum
CREATE TYPE "TariffBasis" AS ENUM ('PACKAGE', 'PER_DAY');

-- DropIndex
DROP INDEX "tariff_rates_procedureId_scheme_cityTier_nabh_effectiveFrom_key";

-- AlterTable
ALTER TABLE "tariff_rates" ADD COLUMN     "basis" "TariffBasis" NOT NULL DEFAULT 'PACKAGE',
ADD COLUMN     "bedCategory" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tariff_rates_procedureId_scheme_cityTier_nabh_basis_bedCate_key" ON "tariff_rates"("procedureId", "scheme", "cityTier", "nabh", "basis", "bedCategory", "effectiveFrom");

