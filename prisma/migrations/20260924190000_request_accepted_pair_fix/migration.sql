-- The first version required acceptedProviderId and acceptedAt to be set together. When an
-- accepted provider is deleted, the FK sets acceptedProviderId to NULL (history is kept) and that
-- rule blocked the delete. New rules: a provider can only be recorded with an acceptance time,
-- and an ACCEPTED/COMPLETED request always has one.
ALTER TABLE "ServiceRequest" DROP CONSTRAINT "ServiceRequest_accepted_pair";
ALTER TABLE "ServiceRequest"
  ADD CONSTRAINT "ServiceRequest_accepted_provider_has_time" CHECK ("acceptedProviderId" IS NULL OR "acceptedAt" IS NOT NULL),
  ADD CONSTRAINT "ServiceRequest_accepted_status_has_time" CHECK ("status" NOT IN ('ACCEPTED', 'COMPLETED') OR "acceptedAt" IS NOT NULL);
