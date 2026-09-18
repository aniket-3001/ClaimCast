-- CreateEnum
CREATE TYPE "CityTier" AS ENUM ('X', 'Y', 'Z');

-- CreateEnum
CREATE TYPE "RoomClass" AS ENUM ('general', 'semi_private', 'private', 'deluxe', 'suite', 'icu');

-- CreateEnum
CREATE TYPE "TariffScheme" AS ENUM ('PMJAY', 'CGHS');

-- CreateEnum
CREATE TYPE "IrdaiList" AS ENUM ('I', 'II', 'III', 'IV');

-- CreateEnum
CREATE TYPE "Route" AS ENUM ('cashless', 'reimbursement');

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "checksum" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "caveat" TEXT,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "tier" "CityTier" NOT NULL,
    "beds" INTEGER NOT NULL,
    "pmjayEmpanelled" BOOLEAN NOT NULL,
    "cghsRateBand" TEXT NOT NULL,
    "costIndex" DOUBLE PRECISION NOT NULL,
    "settlementDays" INTEGER NOT NULL,
    "preAuthHours" INTEGER,
    "flags" TEXT[],
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_network" (
    "hospitalId" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,

    CONSTRAINT "hospital_network_pkey" PRIMARY KEY ("hospitalId","insurer")
);

-- CreateTable
CREATE TABLE "hospital_tariffs" (
    "hospitalId" TEXT NOT NULL,
    "cls" "RoomClass" NOT NULL,
    "perDay" INTEGER NOT NULL,

    CONSTRAINT "hospital_tariffs_pkey" PRIMARY KEY ("hospitalId","cls")
);

-- CreateTable
CREATE TABLE "procedures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hbpCode" TEXT,
    "specialty" TEXT NOT NULL,
    "dayCare" BOOLEAN NOT NULL,
    "medianStayDays" INTEGER NOT NULL,
    "usesImplant" BOOLEAN NOT NULL,
    "privateLow" INTEGER NOT NULL,
    "privateHigh" INTEGER NOT NULL,
    "surgical" INTEGER NOT NULL,
    "nursingPerDay" INTEGER NOT NULL,
    "icuPerDay" INTEGER,
    "diagnostics" INTEGER NOT NULL,
    "pharmacyPerDay" INTEGER NOT NULL,
    "implant" INTEGER,
    "otherIndependent" INTEGER NOT NULL,
    "nonPayableFixed" INTEGER NOT NULL,
    "nonPayablePerDay" INTEGER NOT NULL,
    "outsideWindow" INTEGER NOT NULL,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implant_options" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "implant_options_pkey" PRIMARY KEY ("procedureId","id")
);

-- CreateTable
CREATE TABLE "tariff_rates" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "scheme" "TariffScheme" NOT NULL,
    "cityTier" "CityTier",
    "nabh" BOOLEAN,
    "amount" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "tariff_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "sumInsured" INTEGER NOT NULL,
    "roomCapPerDay" INTEGER,
    "roomCapPctOfSI" DOUBLE PRECISION,
    "icuCapPerDay" INTEGER,
    "icuCapPctOfSI" DOUBLE PRECISION,
    "proportionateDeduction" BOOLEAN NOT NULL,
    "copayPct" DOUBLE PRECISION NOT NULL,
    "implantSubLimit" INTEGER,
    "preHospDays" INTEGER NOT NULL,
    "postHospDays" INTEGER NOT NULL,
    "dayCareCovered" BOOLEAN NOT NULL,
    "monthsInForce" INTEGER NOT NULL,
    "pedWaitingMonths" INTEGER NOT NULL,
    "moratoriumMonths" INTEGER NOT NULL,
    "notes" TEXT,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clauses" (
    "id" TEXT NOT NULL,
    "cite" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "url" TEXT,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_payable_items" (
    "id" TEXT NOT NULL,
    "list" "IrdaiList" NOT NULL,
    "code" TEXT,
    "label" TEXT NOT NULL,
    "typical" INTEGER,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "non_payable_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admissions" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "roomClass" "RoomClass" NOT NULL,
    "route" "Route" NOT NULL,
    "lines" JSONB NOT NULL,
    "edgeCase" TEXT,
    "siUsed" INTEGER,
    "repudiatedReason" TEXT,
    "repudiatedClause" TEXT,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "input" JSONB NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "policyId" TEXT,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "extraction" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hospitals_city_idx" ON "hospitals"("city");

-- CreateIndex
CREATE INDEX "procedures_specialty_idx" ON "procedures"("specialty");

-- CreateIndex
CREATE UNIQUE INDEX "tariff_rates_procedureId_scheme_cityTier_nabh_effectiveFrom_key" ON "tariff_rates"("procedureId", "scheme", "cityTier", "nabh", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "non_payable_items_list_label_key" ON "non_payable_items"("list", "label");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "cases_userId_idx" ON "cases"("userId");

-- CreateIndex
CREATE INDEX "policy_documents_userId_idx" ON "policy_documents"("userId");

-- AddForeignKey
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_network" ADD CONSTRAINT "hospital_network_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_tariffs" ADD CONSTRAINT "hospital_tariffs_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implant_options" ADD CONSTRAINT "implant_options_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_payable_items" ADD CONSTRAINT "non_payable_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
