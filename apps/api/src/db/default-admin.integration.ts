import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { ensureDefaultAdmin } from "./default-admin.js";
import { usersService } from "../modules/users/users.service.js";

assert.equal(process.env.NODE_ENV, "test");
assert.equal(
  new URL(process.env.DATABASE_URL!).pathname,
  "/epi_default_admin_test",
);
process.env.INITIAL_ADMIN_PASSWORD = "integration-bootstrap-password";
try {
  await Promise.all([
    ensureDefaultAdmin(),
    ensureDefaultAdmin(),
    ensureDefaultAdmin(),
  ]);
  const admins = await prisma.user.findMany({
    where: { role: "SYSTEM_ADMIN" },
  });
  assert.equal(admins.length, 1);
  const admin = admins[0]!;
  assert.equal(admin.username, "admin");
  assert.equal(admin.mustChangePassword, true);
  assert.equal(await bcrypt.compare("integration-bootstrap-password", admin.password), true);
  const actor = {
    sub: admin.id,
    username: admin.username,
    role: "system_admin",
    organizationId: null,
    featureKeys: [],
  };
  await assert.rejects(
    () => usersService.update(actor, admin.id, { isActive: false }),
    { statusCode: 409 },
  );
  await assert.rejects(() => usersService.delete(actor, admin.id), {
    statusCode: 409,
  });
  const organization = await prisma.organization.create({
    data: { name: "Organización de prueba" },
  });
  const site = await prisma.site.create({
    data: { name: "Sitio de prueba", organizationId: organization.id },
  });
  const user = await usersService.create(actor, {
    name: "Usuario",
    username: "usuario",
    email: "usuario@example.test",
    password: "other-password",
    role: "functionality_user",
    organizationId: organization.id,
    siteIds: [site.id],
    featureKeys: [],
    reportTemplateKeys: [],
  });
  assert.equal(user.role, "functionality_user");
  await assert.rejects(
    () => usersService.update(actor, user.id, { role: "system_admin" }),
    { statusCode: 409 },
  );
  await prisma.user.update({
    where: { id: admin.id },
    data: {
      password: await bcrypt.hash("changed-password", 12),
      mustChangePassword: false,
    },
  });
  await ensureDefaultAdmin();
  const persisted = await prisma.user.findUniqueOrThrow({
    where: { id: admin.id },
  });
  assert.equal(
    await bcrypt.compare("changed-password", persisted.password),
    true,
  );
  assert.equal(persisted.mustChangePassword, false);
  console.log("✓ default administrator integration passed");
} finally {
  await prisma.$disconnect();
}
