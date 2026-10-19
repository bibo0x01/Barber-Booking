-- CreateTable
CREATE TABLE "BarberWorkingHour" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BarberWorkingHour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BarberWorkingHour_barberId_isActive_idx" ON "BarberWorkingHour"("barberId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BarberWorkingHour_barberId_dayOfWeek_key" ON "BarberWorkingHour"("barberId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "BarberWorkingHour" ADD CONSTRAINT "BarberWorkingHour_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
