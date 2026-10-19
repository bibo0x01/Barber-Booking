-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'COMPLETED');
-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "QueueEntry_bookingId_key" ON "QueueEntry"("bookingId");
-- CreateIndex
CREATE INDEX "QueueEntry_status_joinedAt_idx" ON "QueueEntry"("status", "joinedAt");
-- AddForeignKey
ALTER TABLE "QueueEntry"
ADD CONSTRAINT "QueueEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;