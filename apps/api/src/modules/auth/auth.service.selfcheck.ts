import assert from "node:assert";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { authService } from "./auth.service.js";
import { usersRepository } from "../users/users.repository.js";
import { auditService } from "../audit/audit.service.js";
import { env } from "../../config/env.js";

const hash = await bcrypt.hash("correct-password", 4);
const user = {
  id: "user-1",
  username: "ana",
  email: "ana@epi.local",
  password: hash,
  role: "FUNCTIONALITY_USER",
  organizationId: "org-1",
  isActive: true,
  mustChangePassword: false,
  failedLoginAttempts: 0,
  lockedUntil: null as Date | null,
};

let failedAttempts = 0;
let lockedUntil: Date | undefined;
let cleared = false;
let auditActions: string[] = [];

usersRepository.findByUsername = (async (username: string) => (username === user.username ? user : null)) as typeof usersRepository.findByUsername;
usersRepository.findFeatureKeys = (async () => ["home", "surveys"]) as typeof usersRepository.findFeatureKeys;
usersRepository.registerFailedLogin = (async () => ++failedAttempts) as typeof usersRepository.registerFailedLogin;
usersRepository.lockAccount = (async (_id: string, until: Date) => {
  lockedUntil = until;
}) as typeof usersRepository.lockAccount;
usersRepository.clearFailedLogins = (async () => {
  cleared = true;
}) as typeof usersRepository.clearFailedLogins;
auditService.record = (async (_actor: unknown, action: string) => {
  auditActions.push(action);
}) as typeof auditService.record;

const token = await authService.login({ username: "ana", password: "correct-password" });
const payload = jwt.verify(token.accessToken, env.JWT_SECRET) as { sub: string; role: string; featureKeys: string[] };
assert.equal(token.tokenType, "Bearer");
assert.equal(payload.sub, "user-1");
assert.equal(payload.role, "functionality_user");
assert.deepEqual(payload.featureKeys, ["home", "surveys"]);
assert.deepEqual(auditActions, ["LOGIN"]);

user.failedLoginAttempts = 2;
await authService.login({ username: "ana", password: "correct-password" });
assert.equal(cleared, true);

await assert.rejects(() => authService.login({ username: "ana", password: "wrong" }), /Invalid credentials/);
assert.equal(failedAttempts, 1);

failedAttempts = 4;
auditActions = [];
await assert.rejects(() => authService.login({ username: "ana", password: "wrong" }), /Invalid credentials/);
assert.ok(lockedUntil && lockedUntil.getTime() > Date.now());
assert.deepEqual(auditActions, ["ACCOUNT_LOCKED"]);

user.lockedUntil = new Date(Date.now() + 60_000);
await assert.rejects(() => authService.login({ username: "ana", password: "correct-password" }), /temporarily locked/);

console.log("✓ auth.service self-check passed");
