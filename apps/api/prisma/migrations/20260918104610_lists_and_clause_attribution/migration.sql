/*
  Warnings:

  - The `cghsRateBand` column on the `hospitals` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `code` on the `non_payable_items` table. All the data in the column will be lost.
  - Added the required column `sourceText` to the `clauses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `group` to the `non_payable_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "clauses" ADD COLUMN     "sourceText" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "hospitals" DROP COLUMN "cghsRateBand",
ADD COLUMN     "cghsRateBand" "CityTier";

-- AlterTable
ALTER TABLE "non_payable_items" DROP COLUMN "code",
ADD COLUMN     "group" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "irdai_lists" (
    "id" "IrdaiList" NOT NULL,
    "title" TEXT NOT NULL,
    "effect" TEXT NOT NULL,

    CONSTRAINT "irdai_lists_pkey" PRIMARY KEY ("id")
);
