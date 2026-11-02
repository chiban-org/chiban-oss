INSERT INTO "gis_layers" ("key", "required") VALUES ('cama', false) ON CONFLICT ("key") DO NOTHING;
