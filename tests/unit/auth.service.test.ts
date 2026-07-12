import { describe, it, expect, vi, beforeEach } from "vitest";
import { APIError } from "better-auth/api";
import type { PrismaClient } from "@prisma/client";
import { AuthService } from "../../server/services/auth.service";
import type { Auth } from "../../server/auth";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from "../../server/lib/http";
import type { RegisterRequest } from "../../shared/schemas/auth";

/**
 * Unit tests for AuthService. The Better Auth instance and Prisma client are
 * fully mocked so the service's own logic (name composition, additional-field
 * forwarding, last-login tracking, response mapping, error translation) is
 * exercised in isolation.
 */

const baseUserRow = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "ada@nexesis.edu",
  firstName: "Ada",
  lastName: "Student",
  role: "student",
  institutionId: "22222222-2222-2222-2222-222222222222",
  departmentId: "33333333-3333-3333-3333-333333333333",
  status: "active",
  mfaEnabled: false,
  emailVerified: false,
  lastLoginAt: null as Date | null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const registerInput: RegisterRequest = {
  email: "ada@nexesis.edu",
  password: "password1234",
  firstName: "Ada",
  lastName: "Student",
  role: "student",
  institutionId: "22222222-2222-2222-2222-222222222222",
  departmentId: "33333333-3333-3333-3333-333333333333",
};

function makeAuth() {
  return {
    api: {
      signUpEmail: vi.fn(),
      signInEmail: vi.fn(),
      getSession: vi.fn(),
    },
  } as unknown as Auth & {
    api: {
      signUpEmail: ReturnType<typeof vi.fn>;
      signInEmail: ReturnType<typeof vi.fn>;
      getSession: ReturnType<typeof vi.fn>;
    };
  };
}

function makePrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as PrismaClient & {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

let auth: ReturnType<typeof makeAuth>;
let prisma: ReturnType<typeof makePrisma>;
let service: AuthService;

beforeEach(() => {
  auth = makeAuth();
  prisma = makePrisma();
  service = new AuthService(auth, prisma);
});

describe("AuthService.register", () => {
  it("composes name from first/last and forwards domain additional fields", async () => {
    auth.api.signUpEmail.mockResolvedValue(new Response(null));
    prisma.user.findUnique.mockResolvedValue(baseUserRow);

    const user = await service.register(registerInput);

    expect(auth.api.signUpEmail).toHaveBeenCalledWith({
      body: {
        email: "ada@nexesis.edu",
        password: "password1234",
        name: "Ada Student",
        firstName: "Ada",
        lastName: "Student",
        role: "student",
        institutionId: "22222222-2222-2222-2222-222222222222",
        departmentId: "33333333-3333-3333-3333-333333333333",
      },
      asResponse: true,
    });
    expect(user.email).toBe("ada@nexesis.edu");
    // never leaks credentials / secrets
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("mfaSecret");
  });

  it("returns only the user and never establishes a session (no cookie)", async () => {
    // Even if Better Auth's response carried a Set-Cookie, register must not
    // surface it — registration provisions an account, it does not sign anyone
    // in. The return value is the user object, not an AuthResult.
    auth.api.signUpEmail.mockResolvedValue(
      new Response(null, {
        headers: { "set-cookie": "better-auth.session_token=leak; HttpOnly" },
      }),
    );
    prisma.user.findUnique.mockResolvedValue(baseUserRow);

    const user = await service.register(registerInput);

    expect(user).not.toHaveProperty("authResponse");
    expect(user.id).toBe(baseUserRow.id);
  });

  it("defaults a null departmentId when omitted", async () => {
    auth.api.signUpEmail.mockResolvedValue(new Response(null));
    prisma.user.findUnique.mockResolvedValue(baseUserRow);
    const { departmentId, ...noDept } = registerInput;
    void departmentId;

    await service.register(noDept);

    expect(auth.api.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ departmentId: null }),
      }),
    );
  });

  it("maps a duplicate-email APIError to ConflictError", async () => {
    auth.api.signUpEmail.mockRejectedValue(
      new APIError("UNPROCESSABLE_ENTITY", {
        message: "User already exists. Use another email.",
      }),
    );

    await expect(service.register(registerInput)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("maps a 422 error Response (asResponse mode) to ConflictError", async () => {
    // With asResponse: true Better Auth returns an error Response instead of
    // throwing; the service must detect it from the status.
    auth.api.signUpEmail.mockResolvedValue(
      new Response(
        JSON.stringify({ message: "User already exists. Use another email." }),
        { status: 422 },
      ),
    );

    await expect(service.register(registerInput)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("AuthService.login", () => {
  it("signs in, updates lastLoginAt, and returns the session cookie response", async () => {
    const authResponse = new Response(null, {
      headers: { "set-cookie": "better-auth.session_token=xyz; HttpOnly" },
    });
    auth.api.signInEmail.mockResolvedValue(authResponse);
    prisma.user.update.mockResolvedValue({
      ...baseUserRow,
      lastLoginAt: new Date("2026-07-12T00:00:00Z"),
    });

    const result = await service.login({
      email: "ada@nexesis.edu",
      password: "password1234",
    });

    expect(auth.api.signInEmail).toHaveBeenCalledWith({
      body: { email: "ada@nexesis.edu", password: "password1234" },
      asResponse: true,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: "ada@nexesis.edu" },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(result.authResponse).toBe(authResponse);
    expect(result.user.lastLoginAt).toBeInstanceOf(Date);
  });

  it("maps invalid credentials to a generic AuthenticationError", async () => {
    auth.api.signInEmail.mockRejectedValue(
      new APIError("UNAUTHORIZED", { message: "Invalid email or password" }),
    );

    await expect(
      service.login({ email: "ada@nexesis.edu", password: "wrong" }),
    ).rejects.toMatchObject({
      name: "AuthenticationError",
      message: "Invalid email or password",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("does not update lastLoginAt when sign-in returns a 401 Response", async () => {
    auth.api.signInEmail.mockResolvedValue(
      new Response(JSON.stringify({ message: "Invalid email or password" }), {
        status: 401,
      }),
    );

    await expect(
      service.login({ email: "ada@nexesis.edu", password: "wrong" }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("AuthService.getCurrentUser", () => {
  it("returns the user for a valid session", async () => {
    auth.api.getSession.mockResolvedValue({ user: { id: baseUserRow.id } });
    prisma.user.findUnique.mockResolvedValue(baseUserRow);

    const user = await service.getCurrentUser(new Headers());

    expect(user.id).toBe(baseUserRow.id);
    expect(auth.api.getSession).toHaveBeenCalledOnce();
  });

  it("throws AuthenticationError when there is no session", async () => {
    auth.api.getSession.mockResolvedValue(null);

    await expect(service.getCurrentUser(new Headers())).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });
});

describe("AuthService.updateProfile", () => {
  it("keeps the composed name in sync when names change", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUserRow);
    prisma.user.update.mockResolvedValue({
      ...baseUserRow,
      firstName: "Ada",
      lastName: "Lovelace",
    });

    await service.updateProfile(baseUserRow.id, { lastName: "Lovelace" });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUserRow.id },
      data: expect.objectContaining({
        firstName: "Ada",
        lastName: "Lovelace",
        name: "Ada Lovelace",
      }),
    });
  });

  it("updates departmentId only when provided", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUserRow);
    prisma.user.update.mockResolvedValue(baseUserRow);

    await service.updateProfile(baseUserRow.id, { firstName: "Adaeze" });

    const call = prisma.user.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty("departmentId");
  });

  it("throws NotFoundError for an unknown user", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.updateProfile("00000000-0000-0000-0000-000000000000", {
        firstName: "X",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
