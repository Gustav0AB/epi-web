import { usersRepository } from "./users.repository.js";
import type { CreateUserDto, UpdateUserDto, User, PaginationMeta } from "@epi/shared";

type RawUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  userFeatures: { featureKey: string }[];
};

export class UsersService {
  async getAll(page = 1, pageSize = 20): Promise<{ users: User[]; meta: PaginationMeta }> {
    const { users, total } = await usersRepository.findAll(page, pageSize);
    return {
      users: users.map(this.#mapToDto),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<User> {
    const user = await usersRepository.findById(id);
    if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404, code: "USER_NOT_FOUND" });
    return this.#mapToDto(user);
  }

  async create(dto: CreateUserDto): Promise<User> {
    const byEmail = await usersRepository.findByEmail(dto.email);
    if (byEmail) throw Object.assign(new Error("Email already in use"), { statusCode: 409, code: "EMAIL_CONFLICT" });

    const byUsername = await usersRepository.findByUsername(dto.username);
    if (byUsername) throw Object.assign(new Error("Username already taken"), { statusCode: 409, code: "USERNAME_CONFLICT" });

    const user = await usersRepository.create(dto);
    return this.#mapToDto(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.getById(id);
    const user = await usersRepository.update(id, dto);
    return this.#mapToDto(user);
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    await usersRepository.delete(id);
  }

  #mapToDto(raw: RawUser): User {
    return {
      id: raw.id,
      name: raw.name,
      username: raw.username,
      email: raw.email,
      role: raw.role.toLowerCase() as "admin" | "user",
      featureKeys: raw.userFeatures.map((f) => f.featureKey),
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
    };
  }
}

export const usersService = new UsersService();
