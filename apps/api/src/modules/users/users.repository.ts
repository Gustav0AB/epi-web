import { prisma } from "../../db/prisma.js";
import type { CreateUserDto, UpdateUserDto } from "@epi/shared";
import bcrypt from "bcryptjs";

const userSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  userFeatures: { select: { featureKey: true } },
} as const;

export const usersRepository = {
  async findAll(page: number, pageSize: number) {
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: userSelect,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count(),
    ]);
    return { users, total };
  },

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: userSelect });
  },

  async findByUsername(username: string) {
    return prisma.user.findUnique({ where: { username } });
  },

  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  async create(dto: CreateUserDto) {
    const hashed = await bcrypt.hash(dto.password, 12);
    const role = (dto.role?.toUpperCase() ?? "USER") as "ADMIN" | "USER";

    const featureData =
      role === "USER" && dto.featureKeys?.length
        ? { userFeatures: { create: dto.featureKeys.map((featureKey) => ({ featureKey })) } }
        : {};

    return prisma.user.create({
      data: { name: dto.name, username: dto.username, email: dto.email, password: hashed, role, ...featureData },
      select: userSelect,
    });
  },

  async update(id: string, dto: UpdateUserDto) {
    return prisma.$transaction(async (tx) => {
      if (dto.featureKeys !== undefined) {
        await tx.userFeature.deleteMany({ where: { userId: id } });
        if (dto.featureKeys.length > 0) {
          await tx.userFeature.createMany({
            data: dto.featureKeys.map((featureKey) => ({ userId: id, featureKey })),
          });
        }
      }

      return tx.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.username !== undefined && { username: dto.username }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.role !== undefined && { role: dto.role.toUpperCase() as "ADMIN" | "USER" }),
        },
        select: userSelect,
      });
    });
  },

  async delete(id: string) {
    return prisma.user.delete({ where: { id } });
  },
};
