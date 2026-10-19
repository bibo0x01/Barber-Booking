-- CreateTable
CREATE TABLE "BarberImage" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BarberImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BarberImage_barberId_sortOrder_idx" ON "BarberImage"("barberId", "sortOrder");

-- AddForeignKey
ALTER TABLE "BarberImage" ADD CONSTRAINT "BarberImage_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
