import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import type { CategoryImportPreview, CategoryImportResult } from "@epi/shared";
import { prisma } from "../../db/prisma.js";
import { createApp } from "../../app.js";
import { catalogService } from "./catalog.service.js";
import { env } from "../../config/env.js";

assert.equal(process.env.NODE_ENV, "test");
assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/epi_setup_test");
const server = createApp().listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert(address && typeof address !== "string");
try {
  const organization = await prisma.organization.create({ data: { name: "Category integration A" } });
  const foreign = await prisma.organization.create({ data: { name: "Category integration B" } });
  const site = await prisma.site.create({ data: { name: "Category test site", organizationId: organization.id } });
  const user = await prisma.user.create({ data: {
    username: "category_import_test", name: "Category test", email: "category-test@example.test", password: "unused",
    role: "ORG_ADMIN", organizationId: organization.id, siteIds: [site.id],
  } });
  const token = jwt.sign({ sub: user.id, username: user.username, role: "org_admin", organizationId: organization.id, featureKeys: [] }, env.JWT_SECRET);
  const request = (csv: string, preview = false) => fetch(`http://127.0.0.1:${address.port}/api/categories/import${preview ? "/preview" : ""}?organizationId=${foreign.id}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" }, body: csv,
  });
  await prisma.category.createMany({ data: [
    { name: "Existing", subcategory: null, organizationId: organization.id, isActive: false },
    { name: "Absent from CSV", subcategory: "Keep", organizationId: organization.id },
  ] });
  const before = await prisma.category.findMany({ where: { organizationId: organization.id }, orderBy: { id: "asc" } });
  const csv = 'category,subcategory\nExisting,\nNew,Topic\nNew,Topic\n,Invalid';
  const preview = await request(csv, true);
  assert.equal(preview.status, 200);
  const previewData = (await preview.json() as { data: CategoryImportPreview }).data;
  assert.equal(previewData.additions.length, 1);
  assert.equal(previewData.duplicates.length, 2);
  assert.equal(previewData.errors.length, 1);
  assert.deepEqual(await prisma.category.findMany({ where: { organizationId: organization.id }, orderBy: { id: "asc" } }), before);
  const imported = await request(csv);
  assert.equal(imported.status, 200);
  assert.equal((await imported.json() as { data: CategoryImportResult }).data.applied, 1);
  assert.equal((await (await request(csv)).json() as { data: CategoryImportResult }).data.applied, 0);
  for (const row of before) assert.deepEqual(await prisma.category.findUnique({ where: { id: row.id } }), row);
  assert.equal(await prisma.category.count({ where: { organizationId: foreign.id } }), 0);
  assert.equal((await request('category,subcategory\n"broken,')).status, 400);
  assert.equal(await prisma.category.count({ where: { organizationId: organization.id } }), 3);

  // Exercise both nullable and non-null keys: PostgreSQL uniqueness differs for NULL.
  for (const subcategory of ["", "Topic"]) {
    const name = subcategory ? "Concurrent topic" : "Concurrent null";
    const concurrentCsv = `category,subcategory\n${name},${subcategory}`;
    const responses = await Promise.all(Array.from({ length: 4 }, () => request(concurrentCsv)));
    let applied = 0;
    for (const response of responses) {
      assert([200, 409].includes(response.status), `Unexpected concurrent status ${response.status}`);
      if (response.status === 200) applied += (await response.json() as { data: CategoryImportResult }).data.applied;
    }
    assert.equal(applied, 1);
    assert.equal(await prisma.category.count({ where: { organizationId: organization.id, name } }), 1);
    assert.equal((await (await request(concurrentCsv)).json() as { data: CategoryImportResult }).data.applied, 0);
  }
  const actor = { sub: user.id, username: user.username, role: "org_admin", organizationId: organization.id, featureKeys: [] };
  const createdSite = await catalogService.createSite(actor, { name: "Sitio creado", programs: ["Local"], activityTypes: ["Curso"], activities: ["Excursión"] });
  assert.deepEqual(createdSite.activities, ["Excursión"]);
  assert((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).siteIds.includes(createdSite.id));
  await catalogService.updateSite(actor, createdSite.id, { programs: ["Local", "Nuevo"] });
  await catalogService.deleteSite(actor, createdSite.id);
  const category = await catalogService.createCategory(actor, { name: "Naturaleza", subcategory: "Bosque" });
  await catalogService.updateCategory(actor, category.id, { subcategory: "Costa" });
  await catalogService.deleteCategory(actor, category.id);
  await catalogService.createCategory(actor, { name: "Naturaleza", subcategory: "Costa" });
  const catRequest = (url: string, method = "GET", body?: unknown) => fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const availableBefore = await catRequest(`http://127.0.0.1:${address.port}/api/categories?siteId=${site.id}`);
  assert((await availableBefore.json() as { data: { id: string }[] }).data.some(item => item.id === category.id));
  assert.equal((await catRequest(`http://127.0.0.1:${address.port}/api/categories?siteId=${foreign.id}`)).status, 403);
  const changes = await prisma.auditLog.findMany({ where: { actorId: user.id, action: { not: "CATEGORY_SITES_CHANGE" }, targetId: { in: [createdSite.id, category.id] } }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(changes.map(item => item.action), ["SITE_CREATE", "SITE_UPDATE", "SITE_DELETE", "CATEGORY_CREATE", "CATEGORY_UPDATE", "CATEGORY_DELETE", "CATEGORY_REACTIVATE"]);
  assert.deepEqual((changes[1]!.metadata as any).previous.programs, ["Local"]);
  assert.deepEqual((changes[1]!.metadata as any).current.programs, ["Local", "Nuevo"]);
  assert.equal((changes[4]!.metadata as any).previous.subcategory, "Bosque");
  assert.equal((changes[4]!.metadata as any).current.subcategory, "Costa");
  assert(changes.every(item => item.actorOrganizationId === organization.id));
  const destination = await catalogService.createSite(actor, { name: "Destino copia", programs: ["Local", "Otro"], activityTypes: ["Visita"] });
  const source = await prisma.site.create({ data: { name: "Origen no asignado", organizationId: organization.id, programs: ["local", "Visiting", "Otro"], activityTypes: ["Taller"] } });
  const foreignSite = await prisma.site.create({ data: { name: "Origen extranjero", organizationId: foreign.id } });
  const sources = await catalogService.catalogSources(actor, destination.id);
  assert(sources.some(item => item.id === source.id));
  assert(!sources.some(item => item.id === foreignSite.id));
  await assert.rejects(() => catalogService.duplicateSiteCatalogs(actor, destination.id, foreignSite.id));
  const copied = await catalogService.duplicateSiteCatalogs(actor, destination.id, source.id);
  assert.deepEqual(copied.programs, ["Local", "Otro", "Visiting"]);
  assert.deepEqual(copied.activityTypes, ["Visita", "Taller"]);
  const copyLog = await prisma.auditLog.findFirstOrThrow({ where: { action: "SITE_CATALOG_DUPLICATE", targetId: destination.id } });
  assert.equal((copyLog.metadata as any).sourceSiteId, source.id);
  assert.deepEqual((await catalogService.duplicateSiteCatalogs(actor, destination.id, source.id)).programs, copied.programs);

  await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_site_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'SITE_UPDATE' AND NEW.metadata->'current'->>'name' = 'Rechazar' THEN RAISE EXCEPTION 'fallo de auditoria simulado'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_site_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_reject_site_audit()`);
  try {
    await assert.rejects(() => catalogService.updateSite(actor, createdSite.id, { name: "Rechazar" }));
    assert.equal((await prisma.site.findUniqueOrThrow({ where: { id: createdSite.id } })).name, "Sitio creado");
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER test_reject_site_audit ON audit_logs`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION test_reject_site_audit()`);
  }

  assert((await prisma.auditLog.count({ where: { actorId: user.id, action: "CATEGORY_IMPORT" } })) > 0);
  console.log("✓ category import HTTP/PostgreSQL: preview, additive writes, scope, audit and concurrency passed");
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
}
