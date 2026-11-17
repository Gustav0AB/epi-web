import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { ensureDefaultAdmin } from "./default-admin.js";

let rows: { id: string; isActive: boolean; password: string; mustChangePassword: boolean }[] = [];
prisma.user.findMany = (async () => rows.map(({ id, isActive }) => ({ id, isActive }))) as unknown as typeof prisma.user.findMany;
prisma.user.create = (async ({ data }: { data: { username: string; email: string; password: string; mustChangePassword: boolean } }) => {
  assert.equal(data.username, "admin"); assert.equal(data.email, "admin@epi.local");
  rows = [{ id: "admin", isActive: true, password: data.password, mustChangePassword: data.mustChangePassword }];
  return rows[0];
}) as unknown as typeof prisma.user.create;
await assert.rejects(() => ensureDefaultAdmin(), /Define INITIAL_ADMIN_PASSWORD/);
assert.equal(rows.length, 0);
process.env.INITIAL_ADMIN_PASSWORD = "test-bootstrap-password";
await ensureDefaultAdmin();
assert.equal(rows.length, 1); assert.equal(rows[0]!.mustChangePassword, true);
assert.equal(await bcrypt.compare("test-bootstrap-password", rows[0]!.password), true);
rows[0]!.password = "already-changed";
delete process.env.INITIAL_ADMIN_PASSWORD;
await ensureDefaultAdmin();
assert.equal(rows.length, 1); assert.equal(rows[0]!.password, "already-changed");
rows[0]!.isActive = false;
await assert.rejects(() => ensureDefaultAdmin(), /desactivado/);
rows = [{ id: "a", isActive: true, password: "x", mustChangePassword: false }, { id: "b", isActive: true, password: "y", mustChangePassword: false }];
await assert.rejects(() => ensureDefaultAdmin(), /más de un administrador/);
console.log("✓ default administrator bootstrap self-check passed");
