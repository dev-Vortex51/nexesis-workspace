---
name: better-auth
description: Better Auth integration standards — server auth instance, Prisma adapter, email/password, JWT plugin, sessions, httpOnly cookies, and server-side API usage. Use when integrating authentication, building login/register/session endpoints, or wiring auth middleware. Triggers on "better auth", "betterAuth", "auth instance", "signUpEmail", "signInEmail", "getSession", "jwt plugin", "auth middleware".
license: MIT
metadata:
  author: better-auth
  version: "1.x"
  source: https://www.better-auth.com/llms.txt
---

# Better Auth Integration Standards

Framework-agnostic authentication for TypeScript. Owns its own database tables
(`user`, `session`, `account`, `verification`) and issues cookie-based sessions.
Credentials are stored in the `account` table (`providerId = "credential"`,
`password` column) — **never** on your domain user row.

## When to Apply

- Creating the server auth instance (`lib/auth.ts`).
- Building register / login / me / logout endpoints.
- Wiring auth middleware that validates a session per request.
- Adding JWT issuance for downstream/external services.
- Adding domain fields (role, tenant id, …) to the user record.

## Install

```bash
npm install better-auth
```

Requires a `.env` with a high-entropy secret (≥32 chars) and base URL:

```txt
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
```

## 1. Server Auth Instance

Place `auth.ts` in project root, `lib/`, `utils/`, `server/`, or `src/`. Export
it as `auth` (named) or default.

```ts title="lib/auth.ts"
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { jwt } from "better-auth/plugins";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,   // default 8
    maxPasswordLength: 128, // default 128
  },
  plugins: [jwt()],
});
```

Import path for the adapter is `better-auth/adapters/prisma`; `provider` is your
datasource (`"postgresql"`, `"mysql"`, `"sqlite"`, …).

**Prisma 7 / custom `output`:** if `schema.prisma` sets a custom `output`,
import `PrismaClient` from that path, not `@prisma/client`.

## 2. Required Database Models

Better Auth core requires these models. Generate/update them with the CLI
(`npx @better-auth/cli generate` — for Prisma, migration is **not** auto-applied;
run your normal Prisma migrate afterward).

```prisma
model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean
  image         String?
  createdAt     DateTime
  updatedAt     DateTime
  sessions      Session[]
  accounts      Account[]
  @@map("user")
}

model Session {
  id        String   @id
  userId    String
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime
  updatedAt DateTime
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("session")
}

model Account {
  id                    String    @id
  userId                String
  accountId             String
  providerId            String
  accessToken           String?
  refreshToken          String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  idToken               String?
  password              String?   // credential password hash lives here
  createdAt             DateTime
  updatedAt             DateTime
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime
  updatedAt  DateTime
  @@map("verification")
}
```

The `jwt()` plugin adds a `Jwks` table (stores signing keys).

## 3. Adding Domain Fields to the User

Use `user.additionalFields`. Each value is a `FieldAttributes` object:
`type` (`"string"`, `"number"`, `"boolean"`, or a `["a","b"]` array = enum),
`required`, `defaultValue` (JS-layer only; the DB column stays optional),
`input` (`false` = server-owned, cannot be set by the caller).

```ts
export const auth = betterAuth({
  user: {
    additionalFields: {
      role:   { type: ["student", "admin"], required: true, input: false },
      tenant: { type: "string", required: true },
    },
  },
});
```

Server-owned fields (`input: false`, e.g. `role`, tenant id) must be written by
your own code, not accepted from the client. Re-run the CLI generate so the
Prisma columns exist.

## 4. Email / Password — Server API

Sign up (extra `additionalFields` go alongside the defaults in `body`):

```ts
const res = await auth.api.signUpEmail({
  body: {
    name: "John Doe",
    email: "john@example.com",
    password: "password1234",  // 8–128 chars by default
    // ...any configured additionalFields
  },
  asResponse: true, // return a Response so you can forward Set-Cookie
});
```

Sign in (requires session cookies to be passed back to the client):

```ts
const res = await auth.api.signInEmail({
  body: { email, password, rememberMe: true },
  asResponse: true,
});
```

`asResponse: true` returns a standard `Response` whose `Set-Cookie` header you
forward to the client. Alternatively `returnHeaders: true` returns
`{ headers, response }`. Passwords are hashed with `scrypt` by default; override
via `emailAndPassword.password.{hash,verify}`.

## 5. Sessions & Cookies

Session management is cookie-based; the session `token` is the cookie value.
Cookies are httpOnly by default. Read the session server-side:

```ts
const session = await auth.api.getSession({
  headers: request.headers,            // must carry the session cookie
  query: { disableCookieCache: true }, // optional: force DB fetch
});
// session -> { user, session } | null
```

Sign out ends the session; revoke with `revokeSession` / `revokeSessions`.
Optional signed cookie-cache for performance:

```ts
session: { cookieCache: { enabled: true, maxAge: 5 * 60 } }
```

## 6. Mounting the Handler

Catch-all route for `/api/auth/*`.

Next.js App Router:

```ts title="app/api/auth/[...all]/route.ts"
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { POST, GET } = toNextJsHandler(auth);
```

Express (v5 wildcard caveat — use `/api/auth/{*any}`; mount JSON parser AFTER):

```ts
import { toNodeHandler } from "better-auth/node";
app.all("/api/auth/*", toNodeHandler(auth));
app.use(express.json());
```

## 7. JWT Plugin

`jwt()` issues JWTs for external services and exposes `/api/auth/token` plus a
JWKS endpoint (`/api/auth/jwks`) for stateless verification (EdDSA/Ed25519,
15-min default expiry, base URL as issuer/audience). It is **not** a session
replacement — sessions still drive normal auth. Retrieve a token server-side by
calling `/api/auth/token` with the session, or read the `set-auth-jwt` response
header returned by `getSession`.

## Gotchas

- Password is on `account`, not `user`. Do not add a `passwordHash` column to the
  domain user and expect Better Auth to use it.
- `defaultValue` on additional fields is JS-layer only — DB columns stay nullable.
- Express v5: register the Better Auth handler BEFORE `express.json()`.
- Re-run the CLI generate whenever you change `additionalFields`.
