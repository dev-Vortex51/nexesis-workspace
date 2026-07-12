import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client for the server layer.
 *
 * A single instance is reused across the process (and across hot-reloads in
 * development) to avoid exhausting the database connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
