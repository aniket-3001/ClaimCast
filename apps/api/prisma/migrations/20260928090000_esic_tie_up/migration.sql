-- ESI as a scheme alongside PM-JAY and CGHS: whether a hospital holds an ESIC
-- tie-up for referred care. ESIC settles those referrals at CGHS package rates.
ALTER TABLE "hospitals" ADD COLUMN "esicTieUp" BOOLEAN NOT NULL DEFAULT false;
