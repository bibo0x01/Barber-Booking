-- Enable GiST equality support for the text barber ID used by the exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- Prevent overlapping confirmed booking intervals for the same barber.
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_no_overlapping_confirmed_barber_time" EXCLUDE USING GIST (
        "barberId" WITH =,
        tsrange("startAt", "endAt", '[)') WITH &&
    )
WHERE ("status" = 'CONFIRMED');