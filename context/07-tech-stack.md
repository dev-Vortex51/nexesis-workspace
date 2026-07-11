# Technology Stack

## Overview

| Layer | Technology | Role |
|-------|-----------|------|
| Framework | Next.js 15 + TypeScript | Frontend application, SSR, API routes |
| Backend API | Node.js + Express.js | REST API, business logic, workflow orchestration |
| UI | Tailwind CSS v4 + shadcn/ui | Responsive, accessible interface |
| Authentication | Better Auth | Auth, sessions, RBAC |
| Database | PostgreSQL 16 + Prisma ORM | Persistent storage, migrations |
| Real-time | Socket.IO | Live notifications, chat, collaboration |
| File Storage | Cloudinary | Document uploads, transformations |
| Email | Brevo (Sendinblue) | Transactional emails, digests |
| Background Jobs | Trigger.dev | Scheduled tasks, reminders, automation |
| Validation | Zod | Request/data validation |
| Testing | Vitest + Playwright | Unit, integration, E2E testing |
| Monitoring | Sentry + Vercel Analytics | Error tracking, performance |

## Tailwind CSS v4

- Import: `@import "tailwindcss"` in CSS (no directives).
- Configuration: CSS-first via `@theme` block (no `tailwind.config.js`).
- Custom tokens defined as CSS custom properties in `@theme`.
- Dark mode: `dark:` prefix with CSS variables.

Example:
```css
@import "tailwindcss";

@theme {
  --color-bg-base: #FAFAFA;
  --color-bg-surface: #FFFFFF;
  --color-text-primary: #0F172A;
  --color-text-muted: #64748B;
  --color-accent-primary: #2563EB;
  --color-border-default: #E2E8F0;
  --color-state-error: #DC2626;
  --color-state-success: #16A34A;
  --font-sans: "Geist Sans", sans-serif;
  --font-mono: "Geist Mono", monospace;
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
}
```

## System Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Browser   │  │    PWA      │  │   Mobile Browser    │  │
│  │  (Next.js)  │  │  (Next.js)  │  │    (Next.js)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP / WebSocket
┌─────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Next.js App (app/)                      │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐ │    │
│  │  │  Pages  │  │ Layouts │  │  API Route Handlers │ │    │
│  │  │  (SSR)  │  │         │  │  (thin delegation)  │ │    │
│  │  └─────────┘  └─────────┘  └─────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Express API (server/)                   │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐ │    │
│  │  │ Routes  │  │Services │  │  Workflow Engine    │ │    │
│  │  │         │  │         │  │                     │ │    │
│  │  └─────────┘  └─────────┘  └─────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ PostgreSQL  │  │  Cloudinary │  │  Redis (sessions)   │  │
│  │  (Prisma)   │  │  (files)    │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE LAYER                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Vercel    │  │   Railway   │  │  Trigger.dev        │  │
│  │  (frontend) │  │  (API + DB) │  │  (background jobs)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
├── app/                          # Next.js App Router — PAGES ONLY
│   ├── (auth)/                   # Auth route group
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── reset-password/page.tsx
│   ├── (dashboard)/              # Dashboard route group
│   │   ├── page.tsx              # Role-based dashboard
│   │   ├── projects/
│   │   ├── documents/
│   │   ├── meetings/
│   │   ├── grades/
│   │   ├── reports/
│   │   ├── settings/
│   │   └── layout.tsx            # Dashboard shell
│   ├── api/                      # Next.js API routes (thin proxy)
│   │   ├── auth/
│   │   └── webhooks/
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles + @theme tokens
├── components/
│   ├── ui/                       # shadcn/ui components (generated, DO NOT MODIFY)
│   ├── layout/                   # App shell, sidebar, nav
│   ├── dashboard/                # Dashboard-specific components
│   ├── projects/                 # Project view components
│   ├── documents/                # Document viewer, upload
│   ├── forms/                    # Reusable form patterns
│   └── shared/                   # Cross-cutting components
├── server/                       # Express.js backend — ALL API LOGIC
│   ├── index.ts                  # Server entry point
│   ├── routes/                   # API route definitions
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── projects.ts
│   │   ├── documents.ts
│   │   ├── meetings.ts
│   │   ├── grades.ts
│   │   ├── reports.ts
│   │   └── ...
│   ├── services/                 # Business logic
│   │   ├── auth.service.ts
│   │   ├── project.service.ts
│   │   ├── workflow.service.ts
│   │   ├── document.service.ts
│   │   ├── notification.service.ts
│   │   └── ...
│   ├── middleware/               # Express middleware
│   │   ├── auth.ts
│   │   ├── rbac.ts
│   │   ├── validation.ts
│   │   └── error-handler.ts
│   ├── workflows/                # Workflow engine
│   │   ├── engine.ts
│   │   ├── stages.ts
│   │   └── transitions.ts
│   ├── jobs/                     # Background job handlers
│   │   ├── reminders.ts
│   │   ├── notifications.ts
│   │   └── reports.ts
│   └── websocket/                # Socket.IO handlers
│       ├── index.ts
│       └── events/
├── database/
│   ├── schema.prisma             # Prisma schema
│   ├── migrations/               # Migration files
│   └── seed.ts                   # Seed data
├── shared/                       # Shared between app and server
│   ├── types/                    # TypeScript types
│   ├── schemas/                  # Zod validation schemas
│   ├── constants/                # App constants
│   └── utils/                    # Shared utilities
├── lib/                          # Utilities (client-side only)
│   ├── utils.ts
│   ├── api-client.ts
│   └── socket-client.ts
├── public/                       # Static assets
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env
├── package.json
└── tsconfig.json
```

## Separation Rule

**Backend first. Frontend only after backend is complete.**

| Layer | Location | Rule |
|-------|----------|------|
| API routes | `server/routes/*.ts` | Express handlers, thin, delegate to services |
| Business logic | `server/services/*.ts` | No HTTP logic, pure functions, testable |
| Validation | `shared/schemas/*.ts` | Zod schemas used by both API and client |
| Types | `shared/types/*.ts` | TypeScript types shared across layers |
| UI pages | `app/**/*.tsx` | Server Components default, `use client` only when needed |
| UI components | `components/**/*.tsx` | Presentation only, no direct API calls |
| API client | `lib/api-client.ts` | Typed client, used by client components only |

## Data Flow

### File Upload Flow

```
User selects file
    │
    ▼
Client validates (type, size)
    │
    ▼
POST /api/documents (multipart)
    │
    ▼
Next.js API route receives file
    │
    ▼
Streams file to Express API
    │
    ▼
Express validates + uploads to Cloudinary
    │
    ▼
Cloudinary returns public_id + URL
    │
    ▼
Prisma creates Document + DocumentVersion
    │
    ▼
Workflow engine checks stage transition
    │
    ▼
Audit log recorded
    │
    ▼
Notification service sends alerts
    │
    ▼
Socket.IO emits to project room
    │
    ▼
Client receives real-time update
```

### Authentication Flow

```
User submits credentials
    │
    ▼
Better Auth validates + issues JWT
    │
    ▼
Token stored in httpOnly cookie
    │
    ▼
Middleware validates token on each request
    │
    ▼
RBAC middleware checks role permissions
    │
    ▼
Request proceeds or returns 403
```

### Workflow Transition Flow

```
Supervisor approves submission
    │
    ▼
POST /projects/:id/approve-topic
    │
    ▼
Service validates: user is supervisor, stage is correct
    │
    ▼
Workflow engine checks transition rules
    │
    ▼
Prisma updates project stage + status
    │
    ▼
Milestone auto-completed, next milestone created
    │
    ▼
Audit log: "stage_changed" with metadata
    │
    ▼
Notification: student receives "topic approved"
    │
    ▼
Socket.IO: project room receives stage update
    │
    ▼
Trigger.dev: schedules deadline reminder for next stage
```

## API Communication

Next.js app communicates with Express backend via:

1. **Server Components**: Direct service calls (shared database connection or internal API)
2. **Client Components**: Fetch API to `/api/*` routes that proxy to Express
3. **Real-time**: Socket.IO client connected to Express server

Recommended: Use a typed API client (e.g., tRPC or a generated OpenAPI client) to ensure type safety across the boundary.

## Environment Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account | `nexesis` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `...` |
| `CLOUDINARY_API_SECRET` | Cloudinary secret | `...` |
| `BETTER_AUTH_SECRET` | Auth signing secret | `...` |
| `BREVO_API_KEY` | Email service key | `...` |
| `TRIGGER_API_KEY` | Background jobs key | `...` |
| `REDIS_URL` | Session/cache store | `redis://...` |
| `SENTRY_DSN` | Error tracking | `https://...` |

## Deployment

| Service | Purpose | Environment |
|---------|---------|-------------|
| Vercel | Next.js frontend + edge functions | Production, Staging |
| Railway / Render | Express API + PostgreSQL | Production, Staging |
| Cloudinary | File storage + CDN | All |
| Brevo | Email delivery | All |
| Trigger.dev | Background job execution | All |
| Redis Cloud | Session store + cache | All |
| Sentry | Error monitoring | All |

## Scaling Strategy

1. **Horizontal**: Stateless API servers behind load balancer.
2. **Database**: Read replicas for reporting queries; connection pooling via PgBouncer.
3. **File storage**: Cloudinary handles scaling automatically.
4. **Real-time**: Socket.IO with Redis adapter for multi-instance broadcast.
5. **Background jobs**: Trigger.dev handles queue scaling.
6. **Caching**: Redis for session data, frequently accessed dashboards, and report caches.

## Security Architecture

| Layer | Measures |
|-------|----------|
| Transport | TLS 1.3 for all communications |
| Authentication | Better Auth with JWT, refresh tokens, MFA |
| Authorization | RBAC with role + institution + project ownership checks |
| Input | Zod validation on all API boundaries |
| Files | Type validation, size limits, Cloudinary virus scanning |
| API | Rate limiting per user/IP, CORS whitelist |
| Data | AES-256 encryption at rest, field-level encryption for sensitive data |
| Audit | Immutable audit logs for all mutations |
| Session | httpOnly cookies, CSRF protection, session timeout |

## Error Handling Strategy

| Layer | Approach |
|-------|----------|
| Validation | Zod errors → 400 with field-level details |
| Auth | 401/403 with clear messages |
| Business logic | Custom error classes → appropriate HTTP codes |
| Database | Prisma errors mapped to user-friendly messages |
| External services | Retry with exponential backoff, circuit breaker pattern |
| Uncaught | Sentry capture + generic 500 response (prod) |

## Monitoring & Observability

| Tool | Purpose |
|------|---------|
| Sentry | Error tracking, performance monitoring |
| Vercel Analytics | Web vitals, traffic |
| PostgreSQL logs | Slow query detection |
| Custom metrics | Workflow completion rates, upload success rates |
| Audit logs | Compliance and security monitoring |
