-- CreateTable
CREATE TABLE "field_observations" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "corrected" BOOLEAN NOT NULL,
    "readValue" TEXT,
    "confirmedValue" TEXT,
    "spanText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_reliability" (
    "field" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "seen" INTEGER NOT NULL DEFAULT 0,
    "corrected" INTEGER NOT NULL DEFAULT 0,
    "unverified" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_reliability_pkey" PRIMARY KEY ("field","model")
);

-- CreateTable
CREATE TABLE "forecast_outcomes" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "request" JSONB NOT NULL,
    "p10" INTEGER NOT NULL,
    "p50" INTEGER NOT NULL,
    "p90" INTEGER NOT NULL,
    "actualTotal" INTEGER NOT NULL,
    "anchorTotal" INTEGER,
    "procedureId" TEXT NOT NULL,
    "cityTier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_choices" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "option" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_choices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_observations_field_model_idx" ON "field_observations"("field", "model");

-- CreateIndex
CREATE INDEX "field_observations_documentId_idx" ON "field_observations"("documentId");

-- CreateIndex
CREATE INDEX "forecast_outcomes_procedureId_cityTier_idx" ON "forecast_outcomes"("procedureId", "cityTier");

-- CreateIndex
CREATE INDEX "branch_choices_stage_option_idx" ON "branch_choices"("stage", "option");

-- AddForeignKey
ALTER TABLE "field_observations" ADD CONSTRAINT "field_observations_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "policy_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_outcomes" ADD CONSTRAINT "forecast_outcomes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
