import { APIError } from "better-auth/api";
import type { PrismaClient } from "@prisma/client";
import type { Auth } from "../auth";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../lib/http";
import type {
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserResponse,
} from "../../shared/schemas/auth";

/**
 * Authentication service.
 *
 * Wraps the Better Auth server API with domain behaviour (name composition,
 * last-login tracking, response mapping) and translates Better Auth's
 * transport-level errors into the application's typed errors. Contains no HTTP
 * concerns — the `auth` instance and Prisma client are injected so the service
 * is unit-testable in isolation.
 *
 * Auth results carry a Web `Response` (`authResponse`) whose `Set-Cookie`
 * headers the route layer forwards to the client, establishing the httpOnly
 * session cookie.
 */

export interface AuthResult {
  user: UserResponse;
  /**
   * Better Auth response carrying the httpOnly session Set-Cookie header(s).
   * Produced by login; the route layer forwards it to establish the session.
   */
  authResponse: Response;
}

// Minimal shape of the user record Better Auth returns / we read from Prisma.
interface UserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  institutionId: string;
  departmentId: string | null;
  status: string;
  mfaEnabled: boolean;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AuthService {
  constructor(
    private readonly auth: Auth,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Register a new user. Better Auth creates the User row and the credential
   * Account (hashed password). This is an admin-only provisioning action, so no
   * session is established (auto sign-in is disabled) and no cookie is returned
   * — the new user authenticates separately via login.
   */
  async register(data: RegisterRequest): Promise<UserResponse> {
    let response: Response;
    try {
      response = await this.auth.api.signUpEmail({
        body: {
          email: data.email,
          password: data.password,
          name: `${data.firstName} ${data.lastName}`,
          firstName: data.firstName,
          lastName: data.lastName,
          // Public registration always creates a base "student" account. Creating
          // elevated roles is restricted to a separate admin-only flow and must
          // never be driven by the client-supplied payload.
          role: "student",
          institutionId: data.institutionId,
          departmentId: data.departmentId ?? null,
        },
        asResponse: true,
      });
    } catch (error) {
      throw this.mapAuthError(error, "register");
    }
    await this.assertOk(response, "register");

    const user = await this.requireUserByEmail(data.email);
    return this.toUserResponse(user);
  }

  /**
   * Authenticate a user with email and password. Updates lastLoginAt and
   * returns the user plus the auth response carrying the session cookie.
   */
  async login(data: LoginRequest): Promise<AuthResult> {
    let response: Response;
    try {
      response = await this.auth.api.signInEmail({
        body: { email: data.email, password: data.password },
        asResponse: true,
      });
    } catch (error) {
      throw this.mapAuthError(error, "login");
    }
    await this.assertOk(response, "login");

    const user = await this.prisma.user.update({
      where: { email: data.email },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: this.toUserResponse(user as unknown as UserRecord),
      authResponse: response,
    };
  }

  /**
   * Resolve the current user from the request headers (session cookie). Throws
   * AuthenticationError if there is no valid session.
   */
  async getCurrentUser(headers: Headers): Promise<UserResponse> {
    const session = await this.auth.api.getSession({ headers });
    if (!session?.user) {
      throw new AuthenticationError("Not authenticated");
    }
    const user = await this.requireUserById(session.user.id);
    return this.toUserResponse(user);
  }

  /**
   * Load a user's public response by id. Used by routes that already hold the
   * authenticated id (from requireAuth) and need not re-resolve the session.
   */
  async getUserById(userId: string): Promise<UserResponse> {
    const user = await this.requireUserById(userId);
    return this.toUserResponse(user);
  }

  /**
   * Update the current user's profile. Only the fields permitted by the API
   * spec (firstName, lastName, departmentId) may change; `name` is kept in sync.
   */
  async updateProfile(
    userId: string,
    data: UpdateProfileRequest,
  ): Promise<UserResponse> {
    const existing = await this.requireUserById(userId);

    const firstName = data.firstName ?? existing.firstName;
    const lastName = data.lastName ?? existing.lastName;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        ...(data.departmentId !== undefined
          ? { departmentId: data.departmentId }
          : {}),
      },
    });

    return this.toUserResponse(updated as unknown as UserRecord);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async requireUserByEmail(email: string): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundError("User not found");
    return user as unknown as UserRecord;
  }

  private async requireUserById(id: string): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("User not found");
    return user as unknown as UserRecord;
  }

  private toUserResponse(user: UserRecord): UserResponse {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role as UserResponse["role"],
      institutionId: user.institutionId,
      departmentId: user.departmentId,
      status: user.status as UserResponse["status"],
      mfaEnabled: user.mfaEnabled,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * With `asResponse: true`, Better Auth returns an error Response (ok:false)
   * instead of throwing, so failures must be detected from the status. Reads
   * the `{ message, code }` error body and raises the matching typed error.
   */
  private async assertOk(
    response: Response,
    context: "register" | "login",
  ): Promise<void> {
    if (response.ok) return;

    let message = "Authentication failed";
    try {
      const body = (await response.clone().json()) as { message?: string };
      if (typeof body.message === "string") message = body.message;
    } catch {
      // non-JSON body; keep the default message
    }

    switch (response.status) {
      case 409:
      case 422:
        throw new ConflictError(message);
      case 401:
      case 403:
        throw new AuthenticationError(
          context === "login" ? "Invalid email or password" : message,
        );
      case 400:
        throw new ValidationError(message);
      default:
        throw new ValidationError(message);
    }
  }

  /**
   * Translate a Better Auth APIError into a typed application error. Better
   * Auth uses HTTP-name statuses; map the ones the auth flows can produce.
   * (Applies when the API is called without `asResponse`, e.g. in unit tests.)
   */
  private mapAuthError(error: unknown, context: "register" | "login"): Error {
    if (error instanceof APIError) {
      const message =
        typeof error.body?.message === "string"
          ? error.body.message
          : "Authentication failed";
      switch (error.status) {
        case "UNPROCESSABLE_ENTITY":
        case "CONFLICT":
          return new ConflictError(message);
        case "UNAUTHORIZED":
        case "FORBIDDEN":
          // Normalise sign-in failures to a generic credential message.
          return new AuthenticationError(
            context === "login" ? "Invalid email or password" : message,
          );
        case "BAD_REQUEST":
          return new ValidationError(message);
        default:
          return new ValidationError(message);
      }
    }
    return error instanceof Error ? error : new Error("Authentication failed");
  }
}

/**
 * Factory for the auth service. Kept as a function so callers (routes, tests)
 * can inject their own auth instance and Prisma client.
 */
export function createAuthService(
  auth: Auth,
  prisma: PrismaClient,
): AuthService {
  return new AuthService(auth, prisma);
}
