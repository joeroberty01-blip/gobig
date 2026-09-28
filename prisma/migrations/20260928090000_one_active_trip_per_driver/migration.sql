-- Phase 19 (found by the dispatch stress test): a driver can hold at most one active trip.
-- Enforced by the database so no race between two acceptances can ever break it.
CREATE UNIQUE INDEX "Trip_one_active_per_driver" ON "Trip" ("driverProviderId") WHERE "status" IN ('ACCEPTED', 'ARRIVED', 'IN_PROGRESS');
