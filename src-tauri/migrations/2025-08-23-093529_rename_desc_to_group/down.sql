-- This file should undo anything in `up.sql`

ALTER TABLE "problems" RENAME COLUMN "group" TO "description";