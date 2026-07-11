# API Specification

## Base URL

```
/api/v1
```

## Authentication

All endpoints require a valid Bearer token from Better Auth, except public health check.

```
Authorization: Bearer <token>
```

## Response Format

All responses follow this envelope:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

Error responses:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [{"field": "email", "message": "Required"}]
  }
}
```

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| UNAUTHORIZED | 401 | Invalid or missing token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource does not exist |
| VALIDATION_ERROR | 400 | Request validation failed |
| CONFLICT | 409 | Resource already exists or state conflict |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

---

## Auth

### POST /auth/register
Register a new user (admin only for institutional accounts).

**Body:**
```json
{
  "email": "string",
  "password": "string",
  "firstName": "string",
  "lastName": "string",
  "role": "student|supervisor|coordinator|hod|admin|examiner",
  "departmentId": "uuid|null",
  "institutionId": "uuid"
}
```

### POST /auth/login
Authenticate and receive token.

**Body:**
```json
{
  "email": "string",
  "password": "string",
  "mfaCode": "string|null"
}
```

### POST /auth/mfa/enable
Enable MFA for current user.

### POST /auth/mfa/verify
Verify MFA setup.

### POST /auth/password/reset-request
Request password reset email.

### POST /auth/password/reset
Reset password with token.

### GET /auth/me
Get current authenticated user.

### PATCH /auth/me
Update current user profile.

---

## Institutions

### GET /institutions
List institutions (super-admin only).

### POST /institutions
Create institution (super-admin only).

**Body:**
```json
{
  "name": "string",
  "slug": "string",
  "settings": {}
}
```

### GET /institutions/:id
Get institution details.

### PATCH /institutions/:id
Update institution settings.

### DELETE /institutions/:id
Soft-delete institution.

---

## Departments

### GET /departments
List departments for current institution.

### POST /departments
Create department (admin only).

**Body:**
```json
{
  "name": "string",
  "code": "string"
}
```

### GET /departments/:id
Get department with user count and project stats.

### PATCH /departments/:id
Update department.

### DELETE /departments/:id
Delete department (if no active projects).

---

## Academic Sessions

### GET /sessions
List sessions for current institution.

### POST /sessions
Create session (coordinator/admin).

**Body:**
```json
{
  "name": "string",
  "startDate": "ISO date",
  "endDate": "ISO date",
  "settings": {
    "topicProposalDeadline": "ISO date",
    "finalSubmissionDeadline": "ISO date"
  }
}
```

### GET /sessions/:id
Get session with project counts and completion stats.

### PATCH /sessions/:id
Update session.

### POST /sessions/:id/activate
Activate session (closes previous active session).

### POST /sessions/:id/close
Close session (no new projects).

---

## Users

### GET /users
List users with filtering by role, department, status.

**Query:**
- `role` — filter by role
- `departmentId` — filter by department
- `status` — active, suspended, inactive
- `search` — search by name or email
- `page`, `limit` — pagination

### POST /users
Create user (admin only).

### GET /users/:id
Get user profile with role-specific data.

### PATCH /users/:id
Update user (admin or self).

### DELETE /users/:id
Suspend user (admin only).

### POST /users/:id/assign-supervisor
Assign supervisor to student (coordinator/admin).

**Body:**
```json
{
  "supervisorId": "uuid"
}
```

---

## Projects

### GET /projects
List projects with role-based filtering.

**Query:**
- `sessionId` — filter by academic session
- `stage` — filter by workflow stage
- `status` — filter by stage status
- `supervisorId` — filter by supervisor
- `studentId` — filter by student
- `overdue` — boolean, filter overdue projects
- `search` — search by title or student name
- `page`, `limit`

**Response varies by role:**
- Student: own project only
- Supervisor: assigned projects
- Coordinator: all projects in institution
- Admin: all projects

### POST /projects
Create project (coordinator assigns student, or student self-registers if configured).

**Body:**
```json
{
  "studentId": "uuid",
  "sessionId": "uuid",
  "departmentId": "uuid",
  "supervisorId": "uuid|null"
}
```

### GET /projects/:id
Get project with full details, current stage, progress, documents, meetings.

### PATCH /projects/:id
Update project metadata (title, description).

### POST /projects/:id/assign-supervisor
Assign or change supervisor.

### POST /projects/:id/submit-topics
Student submits proposed research topics.

**Body:**
```json
{
  "topics": [
    {"title": "string", "description": "string"}
  ]
}
```

### POST /projects/:id/approve-topic
Supervisor approves a topic.

**Body:**
```json
{
  "topicIndex": 0,
  "comment": "string"
}
```

### POST /projects/:id/request-revision
Request revision at any review stage.

**Body:**
```json
{
  "stage": "string",
  "feedback": "string",
  "deadline": "ISO date|null"
}
```

### POST /projects/:id/recommend-defense
Supervisor recommends project for defense.

### POST /projects/:id/schedule-defense
Coordinator schedules defense.

**Body:**
```json
{
  "scheduledAt": "ISO date",
  "location": "string",
  "examinerIds": ["uuid"]
}
```

### POST /projects/:id/complete
Mark project as completed (coordinator, post-defense).

### GET /projects/:id/timeline
Get complete project timeline with all stage transitions.

### GET /projects/:id/progress
Get computed progress percentage and milestone status.

---

## Documents

### GET /projects/:projectId/documents
List documents for a project.

**Query:**
- `type` — filter by document type
- `includeDeleted` — boolean (admin only)

### POST /projects/:projectId/documents
Upload a new document.

**Body (multipart/form-data):**
- `file` — binary
- `name` — string
- `type` — enum
- `changeNotes` — string (optional)

**Flow:**
1. Validate file (type, size).
2. Upload to Cloudinary.
3. Create Document record.
4. Create initial DocumentVersion.
5. Trigger workflow update if applicable.
6. Log audit event.
7. Notify relevant users.

### GET /documents/:id
Get document with current version details.

### POST /documents/:id/versions
Upload a new version of an existing document.

**Body (multipart/form-data):**
- `file` — binary
- `changeNotes` — string

### GET /documents/:id/versions
List all versions of a document.

### GET /documents/:id/versions/:versionNumber
Get specific version with download URL.

### DELETE /documents/:id
Soft-delete document (sets isDeleted, retains versions).

### POST /documents/:id/restore
Restore a soft-deleted document (admin only).

---

## Feedback

### GET /document-versions/:versionId/feedback
List all feedback on a document version.

### POST /document-versions/:versionId/feedback
Add feedback to a document version.

**Body:**
```json
{
  "type": "inline_comment|general_comment|voice_note|annotation|approval_comment",
  "content": "string",
  "audioUrl": "string|null",
  "pageNumber": 1,
  "positionX": 120.5,
  "positionY": 200.0
}
```

### PATCH /feedback/:id
Update feedback (author only, within 24h).

### DELETE /feedback/:id
Delete feedback (author or admin only).

---

## Meetings

### GET /projects/:projectId/meetings
List meetings for a project.

### POST /projects/:projectId/meetings
Schedule a meeting.

**Body:**
```json
{
  "title": "string",
  "type": "physical|online",
  "location": "string|null",
  "meetingUrl": "string|null",
  "scheduledAt": "ISO date",
  "duration": 60,
  "attendeeIds": ["uuid"]
}
```

### GET /meetings/:id
Get meeting with attendees and notes.

### PATCH /meetings/:id
Update meeting details (organizer only, before scheduled time).

### DELETE /meetings/:id
Cancel meeting (organizer only).

### POST /meetings/:id/attendance
Record attendance.

**Body:**
```json
{
  "attendances": [
    {"userId": "uuid", "attended": true, "notes": "string"}
  ]
}
```

### POST /meetings/:id/notes
Add meeting notes.

**Body:**
```json
{
  "content": "string"
}
```

---

## Grades

### GET /projects/:projectId/grades
List all grades for a project.

### POST /projects/:projectId/grades
Create a grade assessment.

**Body:**
```json
{
  "rubricId": "uuid",
  "components": [
    {"criterionId": "uuid", "score": 18.5, "maxScore": 20, "comment": "string"}
  ]
}
```

### GET /grades/:id
Get grade with components and computed totals.

### PATCH /grades/:id
Update draft grade (assessor only).

### POST /grades/:id/submit
Submit grade for approval.

### POST /grades/:id/approve
Approve grade (coordinator/admin).

**Body:**
```json
{
  "approved": true,
  "comment": "string"
}
```

### POST /grades/:id/reject
Reject grade for revision.

---

## Rubrics

### GET /rubrics
List rubrics for institution.

### POST /rubrics
Create rubric (coordinator/admin).

**Body:**
```json
{
  "name": "string",
  "description": "string",
  "departmentId": "uuid|null",
  "criteria": [
    {"name": "string", "description": "string", "maxScore": 20, "weight": 1.0, "order": 1}
  ]
}
```

### GET /rubrics/:id
Get rubric with criteria.

### PATCH /rubrics/:id
Update rubric.

### DELETE /rubrics/:id
Delete rubric (if unused).

---

## Messages

### GET /projects/:projectId/messages
List messages for a project (participants only).

**Query:**
- `before` — cursor pagination timestamp
- `limit` — default 50

### POST /projects/:projectId/messages
Send a message.

**Body:**
```json
{
  "content": "string"
}
```

### POST /messages/:id/read
Mark message as read.

---

## Announcements

### GET /announcements
List announcements for user's scope.

**Query:**
- `institutionId` — required
- `departmentId` — optional
- `sessionId` — optional
- `priority` — filter

### POST /announcements
Create announcement (coordinator/admin).

**Body:**
```json
{
  "title": "string",
  "content": "string",
  "departmentId": "uuid|null",
  "sessionId": "uuid|null",
  "priority": "low|normal|high|urgent",
  "expiresAt": "ISO date|null"
}
```

### GET /announcements/:id
Get announcement.

### DELETE /announcements/:id
Delete announcement (author or admin).

---

## Notifications

### GET /notifications
List notifications for current user.

**Query:**
- `unreadOnly` — boolean
- `type` — filter
- `page`, `limit`

### POST /notifications/:id/read
Mark notification as read.

### POST /notifications/read-all
Mark all notifications as read.

### DELETE /notifications/:id
Dismiss notification.

---

## Reports

### GET /reports
List generated reports.

**Query:**
- `type` — filter by report type
- `status` — queued, generating, completed, failed

### POST /reports
Generate a report.

**Body:**
```json
{
  "type": "student_progress|supervisor_workload|department_performance|completion|grading|activity|compliance|audit",
  "format": "pdf|excel",
  "parameters": {
    "sessionId": "uuid",
    "departmentId": "uuid|null",
    "dateRange": {"from": "ISO date", "to": "ISO date"}
  }
}
```

### GET /reports/:id
Get report status and download URL.

### DELETE /reports/:id
Delete report record.

---

## Audit Logs

### GET /audit-logs
Query audit logs (admin only).

**Query:**
- `entityType` — filter by entity
- `entityId` — filter by specific entity
- `userId` — filter by user
- `action` — filter by action type
- `from`, `to` — date range
- `page`, `limit`

### GET /audit-logs/export
Export audit logs (admin only).

**Query:**
- Same filters as above
- `format` — csv, json

---

## Dashboard

### GET /dashboard
Get personalized dashboard data.

**Response shape varies by role:**

**Student:**
```json
{
  "project": { "id": "uuid", "stage": "string", "status": "string", "progress": 65 },
  "pendingTasks": [{"type": "string", "deadline": "ISO date"}],
  "upcomingDeadlines": [],
  "recentFeedback": [],
  "upcomingMeetings": [],
  "unreadNotifications": 5
}
```

**Supervisor:**
```json
{
  "pendingApprovals": 3,
  "pendingReviews": 5,
  "superviseeCount": 8,
  "superviseeProgress": [{"id": "uuid", "name": "string", "stage": "string", "progress": 70}],
  "upcomingMeetings": [],
  "alerts": [{"type": "overdue", "projectId": "uuid", "message": "string"}]
}
```

**Coordinator:**
```json
{
  "totalProjects": 150,
  "activeProjects": 120,
  "completedProjects": 25,
  "overdueProjects": 5,
  "stageBreakdown": {"topic_proposal": 30, "chapter_reviews": 60, ...},
  "supervisorWorkload": [{"id": "uuid", "name": "string", "assigned": 8, "overdue": 1}],
  "pendingActions": 12,
  "recentActivity": []
}
```

---

## WebSocket Events (Socket.IO)

### Connection

Clients authenticate via token in connection handshake.

### Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `notification:new` | Server → Client | Notification object | New notification |
| `message:new` | Server → Client | Message object | New project message |
| `project:stage_changed` | Server → Client | `{projectId, oldStage, newStage}` | Workflow advancement |
| `document:uploaded` | Server → Client | Document object | New document uploaded |
| `feedback:new` | Server → Client | Feedback object | New feedback on document |
| `meeting:reminder` | Server → Client | Meeting object | Upcoming meeting alert |
| `grade:submitted` | Server → Client | Grade object | Grade awaiting approval |
| `user:typing` | Client → Server | `{projectId, userId}` | Typing indicator |

### Rooms

- `user:{userId}` — personal notifications
- `project:{projectId}` — project-specific events
- `institution:{institutionId}` — institution-wide announcements
