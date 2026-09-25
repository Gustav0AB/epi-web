import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { usersRepository } from "../users/users.repository.js";
import { auditService } from "../audit/audit.service.js";
import { env } from "../../config/env.js";
import type { LoginDto, AuthToken } from "@epi/shared";

// ponytail: umbral/duración fijos en código — mover a env si algún día se
// necesita ajustar por despliegue.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export const authService = {
  async login(dto: LoginDto): Promise<AuthToken> {
    const user = await usersRepository.findByUsername(dto.username);
    if (!user) throw Object.assign(new Error("Invalid credentials"), { statusCode: 401, code: "INVALID_CREDENTIALS" });

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw Object.assign(new Error("Account temporarily locked due to repeated failed logins"), {
        statusCode: 423,
        code: "ACCOUNT_LOCKED",
      });
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      const attempts = await usersRepository.registerFailedLogin(user.id);
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
        await usersRepository.lockAccount(user.id, until);
        await auditService.record(
          { sub: user.id, username: user.username, role: user.role.toLowerCase(), organizationId: user.organizationId, featureKeys: [] },
          "ACCOUNT_LOCKED",
          { type: "User", id: user.id },
          { attempts, until: until.toISOString() }
        );
      }
      throw Object.assign(new Error("Invalid credentials"), { statusCode: 401, code: "INVALID_CREDENTIALS" });
    }

    if (!user.isActive) throw Object.assign(new Error("Account is inactive"), { statusCode: 403, code: "ACCOUNT_INACTIVE" });

    if (user.failedLoginAttempts > 0 || user.lockedUntil) await usersRepository.clearFailedLogins(user.id);

    const featureKeys =
      user.role === "FUNCTIONALITY_USER" ? await usersRepository.findFeatureKeys(user.id) : [];
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role.toLowerCase(),
      organizationId: user.organizationId,
      featureKeys,
    };
    const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });

    await auditService.record(payload, "LOGIN");

    return { accessToken, tokenType: "Bearer", expiresIn: SESSION_TTL_SECONDS, mustChangePassword: user.mustChangePassword };
  },
};
