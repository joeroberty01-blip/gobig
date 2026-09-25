-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "serviceRadiusKm" INTEGER;

-- CreateIndex
CREATE INDEX "ProviderProfile_latitude_longitude_idx" ON "ProviderProfile"("latitude", "longitude");

-- Coordinates come in pairs and must be real positions; the radius is a sane distance.
ALTER TABLE "ProviderProfile"
  ADD CONSTRAINT "ProviderProfile_coords_pair" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "ProviderProfile_coords_range" CHECK ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)),
  ADD CONSTRAINT "ProviderProfile_radius_range" CHECK ("serviceRadiusKm" IS NULL OR "serviceRadiusKm" BETWEEN 1 AND 50);
ALTER TABLE "Location"
  ADD CONSTRAINT "Location_coords_pair" CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
