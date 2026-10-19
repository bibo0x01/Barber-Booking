CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED');
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "serviceName" TEXT NOT NULL,
    "serviceDescription" TEXT,
    "servicePrice" DECIMAL(10, 2) NOT NULL,
    "serviceDurationMin" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Booking_userId_startAt_idx" ON "Booking"("userId", "startAt");
CREATE INDEX "Booking_barberId_startAt_idx" ON "Booking"("barberId", "startAt");
CREATE INDEX "Booking_barberId_status_startAt_idx" ON "Booking"("barberId", "status", "startAt");
CREATE INDEX "Booking_serviceId_idx" ON "Booking"("serviceId");
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "BarberService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;