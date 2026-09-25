-- Rules the Prisma schema language cannot express, enforced by the database itself.

-- A user must be reachable: at least one of email / phone.
ALTER TABLE "User"
  ADD CONSTRAINT "User_email_or_phone" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);

-- Prices are whole, non-negative TZS, and a range never runs backwards.
ALTER TABLE "ProviderService"
  ADD CONSTRAINT "ProviderService_price_non_negative"
    CHECK (("priceMin" IS NULL OR "priceMin" >= 0) AND ("priceMax" IS NULL OR "priceMax" >= 0)),
  ADD CONSTRAINT "ProviderService_price_order"
    CHECK ("priceMin" IS NULL OR "priceMax" IS NULL OR "priceMin" <= "priceMax");

-- A category / location cannot be its own parent.
ALTER TABLE "Category" ADD CONSTRAINT "Category_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "Location" ADD CONSTRAINT "Location_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- Exactly one OWNER per provider.
CREATE UNIQUE INDEX "ProviderMember_one_owner" ON "ProviderMember" ("providerId") WHERE "role" = 'OWNER';
