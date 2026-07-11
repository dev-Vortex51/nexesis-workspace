# Workflow Specification

## Project Lifecycle State Machine

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Registration│────▶│ Supervisor       │────▶│ Topic Proposal  │
│             │     │ Assignment       │     │                 │
└─────────────┘     └──────────────────┘     └─────────────────┘
                                                      │
                                                      ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Proposal   │◀────│ Topic Approval   │◀────│  (Student       │
│             │     │  (Supervisor)    │     │  submits topics)│
└─────────────┘     └──────────────────┘     └─────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Chapter Reviews                            │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │ Chapter │───▶│ Review  │───▶│ Revise  │───▶│ Approve │  │
│  │ Upload  │    │ (Super) │    │ (Student)│   │ (Super) │  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│         ▲                                        │          │
│         └────────────────────────────────────────┘          │
│                    (revision loop)                          │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Final     │────▶│ Supervisor       │────▶│    Defense      │
│  Submission │     │ Approval         │     │                 │
└─────────────┘     └──────────────────┘     └─────────────────┘
                                                      │
                                                      ▼
┌─────────────┐     ┌──────────────────┐
│   Archive   │◀────│   Completion     │
│             │     │                  │
└─────────────┘     └──────────────────┘
```

## Stage Definitions

| # | Stage | Entry Condition | Exit Condition | Approver |
|---|-------|----------------|----------------|----------|
| 1 | **Registration** | Student enrolled in academic session | Supervisor assigned | Coordinator / System |
| 2 | **Supervisor Assignment** | Student registered | Supervisor confirmed | Coordinator |
| 3 | **Topic Proposal** | Supervisor assigned | Topics submitted | Student |
| 4 | **Topic Approval** | Topics submitted | One topic approved or revision requested | Supervisor |
| 5 | **Proposal** | Topic approved | Proposal document uploaded | Student |
| 6 | **Chapter Reviews** | Proposal accepted | All chapters reviewed and approved | Supervisor |
| 7 | **Final Submission** | All chapters approved | Final thesis uploaded | Student |
| 8 | **Supervisor Approval** | Final submission uploaded | Supervisor recommends for defense | Supervisor |
| 9 | **Defense** | Supervisor recommendation | Defense completed | Coordinator / Examiner Panel |
| 10 | **Completion** | Defense passed | Final grade recorded | Coordinator |
| 11 | **Archive** | Completion confirmed | Project archived | System (automated) |

## Stage Transition Rules

1. **No skipping**: Every stage must be completed in sequence.
2. **Backward movement allowed**: Through explicit revision requests from the approving authority.
3. **Progression trigger**: Workflow engine validates required approvals before advancing.
4. **Revision loop**: When a supervisor requests revisions, the project returns to the student for rework. The revised submission creates a new version and re-enters the review stage.
5. **Deadline enforcement**: Each stage has a configurable deadline. Overdue stages trigger automatic escalation notifications.

## Document Workflow

| Document | Uploaded By | Stage | Versions |
|----------|------------|-------|----------|
| Topic proposals | Student | Topic Proposal | Yes |
| Proposal document | Student | Proposal | Yes |
| Chapters | Student | Chapter Reviews | Yes |
| Reports | Student / Supervisor | Various | Yes |
| Assessments | Supervisor / Examiner | Grading | Yes |
| Defense documents | Coordinator | Defense | Yes |
| Final thesis | Student | Final Submission | Yes |

### File Handling Rules

- **Allowed types**: PDF, DOCX, PPTX, XLSX, images, ZIP.
- **Max size**: 200 MB per file (configurable per institution).
- **Versioning**: All uploads are version-controlled. Previous versions remain accessible.
- **Replacement**: Files can be replaced through version-controlled uploads.
- **Recovery**: Deleted files remain recoverable within the retention policy.

## Feedback Workflow

| Feedback Type | Description | Required |
|---------------|-------------|----------|
| Inline comments | Annotations on specific document sections | Optional |
| General comments | Overall feedback on a submission | Optional |
| Voice notes | Audio feedback attached to submissions | Optional |
| File annotations | Markup on uploaded documents | Yes |
| Approval comments | Mandatory comment when approving or rejecting | Yes |
| Revision history | Complete audit trail of all changes | Automatic |

## Approval Workflow

1. Reviewer opens submission.
2. Reviewer adds annotations and comments.
3. Reviewer selects action: **Approve**, **Request Revision**, or **Reject**.
4. If approved: workflow advances, approval comment recorded, student notified.
5. If revision requested: project returns to student with feedback, new deadline set.
6. If rejected: project returns to previous stage with mandatory feedback.

## Grading Workflow

1. Configurable rubric-based assessment defined by institution.
2. Supervisors and examiners grade independently.
3. Multiple examiners can grade the same project.
4. Automatic calculation of composite scores.
5. Multi-level grade approval workflow before finalization.

## Meeting Workflow

1. Student or supervisor initiates meeting request.
2. Meeting can be physical or online.
3. Automatic reminders sent to all participants.
4. Attendance recorded.
5. Meeting notes stored permanently and linked to the project.

## Communication Channels

| Channel | Purpose |
|---------|---------|
| Email | Transactional notifications, digests |
| In-app chat | Direct messaging between users |
| Announcements | Broadcast messages from coordinators/admins |
| Notifications | Real-time alerts for workflow events |
| SMS | Optional critical alerts |
| Push notifications | Real-time updates for PWA users |

## Automated Processes

The following occur without manual intervention:

- Notifications on workflow state changes
- Deadline reminders (24h, 48h, 7d before due)
- Workflow stage transitions upon approval
- Document versioning on upload
- Audit logging for all critical actions
- Report generation on schedule
- Deadline monitoring and escalation
- Automated backups
- Project archival upon completion
