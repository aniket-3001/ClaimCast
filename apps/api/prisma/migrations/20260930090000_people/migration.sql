-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "relation" TEXT,
    "name" TEXT,
    "age" INTEGER,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "people_sessionId_idx" ON "people"("sessionId");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "saved_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

