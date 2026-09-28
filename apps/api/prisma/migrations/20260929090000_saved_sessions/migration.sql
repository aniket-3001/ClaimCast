-- CreateTable
CREATE TABLE "saved_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "policyholder" TEXT,
    "input" JSONB NOT NULL,
    "policy" JSONB,
    "documentId" TEXT,
    "summary" JSONB NOT NULL,
    "chat" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_sessions_createdAt_idx" ON "saved_sessions"("createdAt");

-- AddForeignKey
ALTER TABLE "saved_sessions" ADD CONSTRAINT "saved_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

