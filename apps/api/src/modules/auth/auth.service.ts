import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { usersRepository } from "../users/users.repository.js";
import { env } from "../../config/env.js";
import type { LoginDto, AuthToken } from "@epi/shared";

export const authService = {
  async login(dto: LoginDto): Promise<AuthToken> {
    const user = await usersRepository.findByEmail(dto.email);
    if (!user) throw Object.assign(new Error("Invalid credentials"), { statusCode: 401, code: "INVALID_CREDENTIALS" });

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw Object.assign(new Error("Invalid credentials"), { statusCode: 401, code: "INVALID_CREDENTIALS" });

    const expiresIn = 7 * 24 * 60 * 60; // 7d in seconds
    const accessToken = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    });

    return { accessToken, tokenType: "Bearer", expiresIn };
  },
};
