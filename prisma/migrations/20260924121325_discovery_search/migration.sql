-- Phase 3: typo-tolerant search (ADR-007). pg_trgm powers similarity()/word_similarity() and the
-- trigram indexes that keep ILIKE '%…%' fast as the catalogue and provider list grow.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Service_nameEn_trgm" ON "Service" USING gin (lower("nameEn") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Service_nameSw_trgm" ON "Service" USING gin (lower("nameSw") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Category_nameEn_trgm" ON "Category" USING gin (lower("nameEn") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Category_nameSw_trgm" ON "Category" USING gin (lower("nameSw") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ProviderProfile_displayName_trgm" ON "ProviderProfile" USING gin (lower("displayName") gin_trgm_ops);
