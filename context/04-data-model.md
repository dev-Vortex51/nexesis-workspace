# Data Model

## Entity Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Institution   │1:N  │   Department    │1:N  │ AcademicSession │
│                 │────▶│                 │────▶│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                                              │
         │ 1:N                                          │ 1:N
         ▼                                              ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│      User       │N:M  │    Project      │1:N  │   Milestone     │
│                 │◀────│                 │────▶│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                      │ 1:N
         │                      ▼
         │               ┌─────────────────┐
         │               │  ProjectMember  │
         │               │  (supervisor)   │
         │               └─────────────────┘
         │                      │
         │                      │ 1:N
         ▼                      ▼
┌─────────────────┐     ┌─────────────────┐
│  Notification   │     │    Document     │
│                 │     │                 │
└─────────────────┘     └─────────────────┘
                               │ 1:N
                               ▼
                        ┌─────────────────┐
                        │  DocumentVersion│
                        └─────────────────┘
                               │ 1:N
                               ▼
                        ┌─────────────────┐
                        │    Feedback     │
                        └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Meeting     │1:N  │  MeetingNote    │     │      Grade      │
│                 │────▶│                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                       │
                                                       │ 1:N
                                                       ▼
                                                ┌─────────────────┐
                                                │  GradeComponent │
                                                └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│   AuditLog      │     │    Report       │
│                 │     │                 │
└─────────────────┘     └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│    Message      │     │  Announcement   │
│                 │     │                 │
└─────────────────┘     └─────────────────┘

┌─────────────────┐
│     Rubric      │
│                 │
└─────────────────┘
```

## Entities

### Institution

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| name | String | Not null |
| slug | String | Unique, not null |
| logoUrl | String | Nullable |
| settings | JSONB | Institution-specific config |
| subscriptionTier | Enum | free, standard, enterprise |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### Department

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| institutionId | UUID | FK → Institution |
| name | String | Not null |
| code | String | Not null |
| createdAt | DateTime | Auto |

### AcademicSession

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| institutionId | UUID | FK → Institution |
| name | String | e.g., "2025/2026 Session" |
| startDate | Date | Not null |
| endDate | Date | Not null |
| status | Enum | planning, active, closed, archived |
| settings | JSONB | Session-specific deadlines |
| createdAt | DateTime | Auto |

### User

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| institutionId | UUID | FK → Institution |
| departmentId | UUID | FK → Department, nullable |
| email | String | Unique, not null |
| passwordHash | String | Not null |
| firstName | String | Not null |
| lastName | String | Not null |
| role | Enum | student, supervisor, coordinator, hod, admin, examiner |
| mfaEnabled | Boolean | Default false |
| mfaSecret | String | Encrypted, nullable |
| status | Enum | active, suspended, inactive |
| lastLoginAt | DateTime | Nullable |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### Project

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| institutionId | UUID | FK → Institution |
| departmentId | UUID | FK → Department |
| sessionId | UUID | FK → AcademicSession |
| studentId | UUID | FK → User |
| title | String | Nullable until approved |
| description | Text | Nullable |
| currentStage | Enum | See workflow stages |
| stageStatus | Enum | pending, in_review, approved, revision_requested |
| progress | Integer | 0–100, computed |
| deadline | DateTime | Nullable |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |
| completedAt | DateTime | Nullable |
| archivedAt | DateTime | Nullable |

### ProjectMember

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| projectId | UUID | FK → Project |
| userId | UUID | FK → User |
| role | Enum | primary_supervisor, co_supervisor, examiner |
| assignedAt | DateTime | Auto |

### Milestone

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| projectId | UUID | FK → Project |
| name | String | Not null |
| stage | Enum | Workflow stage |
| deadline | DateTime | Not null |
| completedAt | DateTime | Nullable |
| status | Enum | pending, overdue, completed |
| createdAt | DateTime | Auto |

### Document

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| projectId | UUID | FK → Project |
| uploadedById | UUID | FK → User |
| name | String | Not null |
| type | Enum | topic_proposal, proposal, chapter, report, assessment, defense, final_thesis, other |
| cloudinaryPublicId | String | Not null |
| cloudinaryUrl | String | Not null |
| fileSize | Integer | Bytes |
| mimeType | String | Not null |
| currentVersion | Integer | Default 1 |
| isDeleted | Boolean | Default false |
| deletedAt | DateTime | Nullable |
| createdAt | DateTime | Auto |

### DocumentVersion

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| documentId | UUID | FK → Document |
| versionNumber | Integer | Not null |
| cloudinaryPublicId | String | Not null |
| cloudinaryUrl | String | Not null |
| fileSize | Integer | Bytes |
| changeNotes | Text | Nullable |
| createdAt | DateTime | Auto |

### Feedback

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| documentVersionId | UUID | FK → DocumentVersion |
| authorId | UUID | FK → User |
| type | Enum | inline_comment, general_comment, voice_note, annotation, approval_comment |
| content | Text | Nullable (for voice notes, store transcript) |
| audioUrl | String | Nullable |
| pageNumber | Integer | Nullable |
| positionX | Float | Nullable |
| positionY | Float | Nullable |
| createdAt | DateTime | Auto |

### Meeting

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| projectId | UUID | FK → Project |
| scheduledById | UUID | FK → User |
| title | String | Not null |
| type | Enum | physical, online |
| location | String | Nullable |
| meetingUrl | String | Nullable |
| scheduledAt | DateTime | Not null |
| duration | Integer | Minutes |
| status | Enum | scheduled, completed, cancelled, no_show |
| reminderSent | Boolean | Default false |
| createdAt | DateTime | Auto |

### MeetingAttendance

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| meetingId | UUID | FK → Meeting |
| userId | UUID | FK → User |
| attended | Boolean | Default false |
| notes | Text | Nullable |

### MeetingNote

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| meetingId | UUID | FK → Meeting |
| authorId | UUID | FK → User |
| content | Text | Not null |
| createdAt | DateTime | Auto |

### Grade

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| projectId | UUID | FK → Project |
| rubricId | UUID | FK → Rubric |
| assessedById | UUID | FK → User |
| totalScore | Float | Computed |
| maxScore | Float | From rubric |
| percentage | Float | Computed |
| status | Enum | draft, submitted, approved, rejected |
| approvedById | UUID | FK → User, nullable |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### GradeComponent

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| gradeId | UUID | FK → Grade |
| criterionId | UUID | FK → RubricCriterion |
| score | Float | Not null |
| maxScore | Float | Not null |
| comment | Text | Nullable |

### Rubric

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| institutionId | UUID | FK → Institution |
| departmentId | UUID | FK → Department, nullable |
| name | String | Not null |
| description | Text | Nullable |
| isDefault | Boolean | Default false |
| createdAt | DateTime | Auto |

### RubricCriterion

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| rubricId | UUID | FK → Rubric |
| name | String | Not null |
| description | Text | Nullable |
| maxScore | Float | Not null |
| weight | Float | Default 1.0 |
| order | Integer | Display order |

### Message

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| projectId | UUID | FK → Project |
| senderId | UUID | FK → User |
| content | Text | Not null |
| isRead | Boolean | Default false |
| createdAt | DateTime | Auto |

### Announcement

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| institutionId | UUID | FK → Institution |
| departmentId | UUID | FK → Department, nullable |
| sessionId | UUID | FK → AcademicSession, nullable |
| authorId | UUID | FK → User |
| title | String | Not null |
| content | Text | Not null |
| priority | Enum | low, normal, high, urgent |
| expiresAt | DateTime | Nullable |
| createdAt | DateTime | Auto |

### Notification

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| userId | UUID | FK → User |
| type | Enum | workflow, deadline, meeting, grade, system |
| title | String | Not null |
| body | Text | Not null |
| actionUrl | String | Nullable |
| isRead | Boolean | Default false |
| sentVia | Enum[] | in_app, email, sms, push |
| createdAt | DateTime | Auto |

### AuditLog

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| institutionId | UUID | FK → Institution |
| userId | UUID | FK → User, nullable (system actions) |
| action | String | Not null |
| entityType | String | Not null |
| entityId | UUID | Not null |
| metadata | JSONB | Contextual data |
| ipAddress | String | Nullable |
| userAgent | String | Nullable |
| createdAt | DateTime | Auto |

### Report

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| institutionId | UUID | FK → Institution |
| generatedById | UUID | FK → User |
| type | Enum | student_progress, supervisor_workload, department_performance, completion, grading, activity, compliance, audit |
| format | Enum | pdf, excel |
| parameters | JSONB | Report filters |
| fileUrl | String | Nullable |
| status | Enum | queued, generating, completed, failed |
| createdAt | DateTime | Auto |
| completedAt | DateTime | Nullable |

## Indexes

| Table | Columns | Purpose |
|-------|---------|---------|
| User | email | Login lookup |
| User | institutionId, role | Role-based queries |
| Project | studentId | Student project lookup |
| Project | institutionId, sessionId, currentStage | Coordinator dashboards |
| Project | currentStage, stageStatus | Workflow monitoring |
| Document | projectId, type | Project document listing |
| DocumentVersion | documentId, versionNumber | Version lookup |
| Feedback | documentVersionId | Document feedback |
| Meeting | projectId, scheduledAt | Upcoming meetings |
| Grade | projectId, assessedById | Project grading |
| AuditLog | institutionId, createdAt | Audit queries |
| Notification | userId, isRead, createdAt | Unread notifications |

## Constraints

1. A student can have only one active project per academic session.
2. A project must have exactly one primary supervisor.
3. Document versions are immutable after creation.
4. Audit logs are append-only and never modified or deleted.
5. Grades cannot be modified after approval without creating a new grade record.
