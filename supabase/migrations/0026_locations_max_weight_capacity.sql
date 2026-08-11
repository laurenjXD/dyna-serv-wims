-- Migration to add max_weight_capacity to locations
ALTER TABLE "locations" ADD COLUMN "max_weight_capacity" numeric(10, 3) DEFAULT 0 NOT NULL;
