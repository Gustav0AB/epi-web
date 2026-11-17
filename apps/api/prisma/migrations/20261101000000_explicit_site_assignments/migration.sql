BEGIN;
-- Prevent concurrent edits while converting the old effective access.
LOCK TABLE "users", "sites" IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE blocked TEXT;
BEGIN
  SELECT string_agg(u.id, ', ' ORDER BY u.id) INTO blocked
  FROM "users" u
  WHERE u.role <> 'SYSTEM_ADMIN' AND NOT EXISTS (
    SELECT 1 FROM "sites" s WHERE s."organizationId" = u."organizationId"
      AND NOT (s.id = ANY(COALESCE(u."excludedSiteIds", ARRAY[]::TEXT[])))
  );
  IF blocked IS NOT NULL THEN
    RAISE EXCEPTION 'Site assignment migration blocked; resolve users first: %', blocked;
  END IF;
END $$;

-- Preserve the old configuration in the audit trail before replacing references.
INSERT INTO "audit_logs" (id, "actorUsername", "actorRole", action, "targetType", "targetId", metadata, "createdAt")
SELECT 'site-assignment-migration-' || u.id, 'migration', 'system_admin',
  'USER_SITE_ACCESS_MIGRATION', 'User', u.id,
  jsonb_build_object('organizationId', u."organizationId", 'previousReferenceSiteIds', u."siteIds",
    'previousExcludedSiteIds', u."excludedSiteIds", 'siteIds', ARRAY(
      SELECT s.id FROM "sites" s WHERE s."organizationId" = u."organizationId"
        AND NOT (s.id = ANY(COALESCE(u."excludedSiteIds", ARRAY[]::TEXT[]))) ORDER BY s.id)),
  CURRENT_TIMESTAMP
FROM "users" u WHERE u.role <> 'SYSTEM_ADMIN';

UPDATE "users" u SET "siteIds" = ARRAY(
  SELECT s.id FROM "sites" s WHERE s."organizationId" = u."organizationId"
    AND NOT (s.id = ANY(COALESCE(u."excludedSiteIds", ARRAY[]::TEXT[]))) ORDER BY s.id
), "updatedAt" = CURRENT_TIMESTAMP WHERE u.role <> 'SYSTEM_ADMIN';

ALTER TABLE "users" ADD CONSTRAINT "users_require_assigned_sites"
CHECK (role = 'SYSTEM_ADMIN' OR ("organizationId" IS NOT NULL AND COALESCE(cardinality("siteIds"), 0) > 0));
COMMIT;
