-- CreateTable
CREATE TABLE "diagnostic_tests" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "nonNabh" INTEGER NOT NULL,
    "nabh" INTEGER NOT NULL,
    "page" INTEGER NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "diagnostic_tests_pkey" PRIMARY KEY ("code")
);

-- AddForeignKey
ALTER TABLE "diagnostic_tests" ADD CONSTRAINT "diagnostic_tests_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "saved_sessions" ADD COLUMN "health" JSONB;
