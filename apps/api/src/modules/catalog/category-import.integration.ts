import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import type { CategoryImportPreview, CategoryImportResult } from "@epi/shared";
import { prisma } from "../../db/prisma.js";
import { createApp } from "../../app.js";
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
  assert((await prisma.auditLog.count({ where: { actorId: user.id, action: "CATEGORY_IMPORT" } })) > 0);
  console.log("✓ category import HTTP/PostgreSQL: preview, additive writes, scope, audit and concurrency passed");
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
}
