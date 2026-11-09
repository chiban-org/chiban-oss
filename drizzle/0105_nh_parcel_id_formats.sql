INSERT INTO "parcel_id_formats" ("key", "label", "kind", "width", "is_display")
VALUES ('cama15', 'CAMA number', 'digits', 15, false)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "parcel_id_formats" ("key", "label", "kind", "width", "is_display")
SELECT 'gis12', 'Map-lot ID', 'digits', 12, NOT EXISTS (SELECT 1 FROM "parcel_id_formats" WHERE "is_display")
ON CONFLICT ("key") DO NOTHING;
