-- Step 2/3 of the Role enum swap: map existing ADMIN/USER rows onto the
-- new 4-value model. ADMIN becomes the global SYSTEM_ADMIN; plain USER
-- becomes FUNCTIONALITY_USER (their existing featureKeys carry over as-is).
UPDATE "users" SET "role" = 'SYSTEM_ADMIN' WHERE "role" = 'ADMIN';
UPDATE "users" SET "role" = 'FUNCTIONALITY_USER' WHERE "role" = 'USER';
