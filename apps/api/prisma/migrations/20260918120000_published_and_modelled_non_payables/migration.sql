-- DropIndex
DROP INDEX "non_payable_items_list_label_key";

-- AlterTable
ALTER TABLE "non_payable_items" ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "serial" INTEGER,
ALTER COLUMN "group" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "non_payable_items_list_published_label_key" ON "non_payable_items"("list", "published", "label");

