import { usersRepository } from "./users.repository.js";
import type { CreateUserDto, UpdateUserDto, User, PaginationMeta } from "@epi/shared";

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
    const existing = await usersRepository.findByEmail(dto.email);
    if (existing) throw Object.assign(new Error("Email already in use"), { statusCode: 409, code: "EMAIL_CONFLICT" });
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

  #mapToDto(raw: { id: string; name: string; email: string; role: string; createdAt: Date; updatedAt: Date }): User {
    return {
      id: raw.id,
      name: raw.name,
      email: raw.email,
      role: raw.role.toLowerCase() as "admin" | "user",
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
    };
  }
}

export const usersService = new UsersService();
