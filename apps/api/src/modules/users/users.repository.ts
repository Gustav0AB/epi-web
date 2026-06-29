import { prisma } from "../../db/prisma.js";
import type { CreateUserDto, UpdateUserDto } from "@epi/shared";
import bcrypt from "bcryptjs";

export const usersRepository = {
  async findAll(page: number, pageSize: number) {
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count(),
    ]);
    return { users, total };
  },

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
  },

  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  async create(dto: CreateUserDto) {
    const hashed = await bcrypt.hash(dto.password, 12);
    return prisma.user.create({
      data: { name: dto.name, email: dto.email, password: hashed, role: dto.role?.toUpperCase() as "ADMIN" | "USER" },
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
  },

  async update(id: string, dto: UpdateUserDto) {
    return prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
  },

  async delete(id: string) {
    return prisma.user.delete({ where: { id } });
  },
};
