import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { jwt } from "better-auth/plugins";
import { prisma } from "./lib/prisma";

/**
 * Better Auth server instance.
 *
 * Provides email/password authentication with httpOnly cookie sessions and a
 * JWT plugin for issuing tokens to downstream services. Credentials are stored
 * by Better Auth in the Account table (providerId "credential") — never on the
 * domain User row.
 *
 * The domain-specific User columns from the data model are surfaced to Better
 * Auth through `user.additionalFields` so they can be set at registration and
 * are returned on the session. Server-owned fields (status, mfa, lastLoginAt)
 * use `input: false` so they can never be set by an untrusted client.
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Registration is an administrative action (see API spec), not a public
    // self-service flow, so no email verification gate is required here.
    autoSignIn: true,
  },

  user: {
    additionalFields: {
      institutionId: { type: "string", required: true, input: true },
      departmentId: { type: "string", required: false, input: true },
      firstName: { type: "string", required: true, input: true },
      lastName: { type: "string", required: true, input: true },
      role: {
        type: ["student", "supervisor", "coordinator", "hod", "admin", "examiner"],
        required: true,
        input: true,
      },
      status: {
        type: ["active", "suspended", "inactive"],
        required: false,
        defaultValue: "active",
        input: false,
      },
      mfaEnabled: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      mfaSecret: { type: "string", required: false, input: false },
      lastLoginAt: { type: "date", required: false, input: false },
    },
  },

  plugins: [jwt()],

  advanced: {
    database: {
      // Let PostgreSQL generate ids via each model's `@default(uuid())` so
      // Better Auth records share the UUID type used across the data model and
      // stay compatible with foreign keys that reference User.id.
      generateId: false,
    },
  },
});

export type Auth = typeof auth;
