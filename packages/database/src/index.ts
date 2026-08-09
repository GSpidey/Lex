import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __lexPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__lexPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.__lexPrisma = prisma;

export * from "@prisma/client";
