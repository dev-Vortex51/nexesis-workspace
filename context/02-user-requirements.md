# User Requirements

## Problem Statement

Higher education institutions manage final-year project supervision through fragmented manual and informal processes — paperwork, email, WhatsApp, spreadsheets, and physical meetings. These methods lack transparency, traceability, standardization, and analytics. The result is delays, inconsistent supervision, poor record keeping, and administrative inefficiency that recur every academic session across all departments.

## Goals

1. Standardize, transparent, and efficient project supervision.
2. Make submission, communication, tracking, monitoring, and reporting easier.
3. Make reviews, approvals, grading, and administration faster.
4. Automate notifications, reminders, workflow transitions, reporting, audit logs, and versioning.
5. Eliminate manual work for status tracking, reminders, workflow monitoring, and record keeping.

## User Roles

### Primary Users

| Role | Responsibilities |
|------|-----------------|
| **Student** | Submit topics, upload chapters, receive feedback, request meetings, track progress, submit final project. |
| **Supervisor** | Approve topics, review submissions, annotate documents, request revisions, approve milestones, assess students, recommend defense. |
| **Project Coordinator** | Configure academic sessions, monitor progress, manage timelines, generate reports, oversee compliance, schedule defenses. |

### Secondary Users

| Role | Responsibilities |
|------|-----------------|
| **HOD** | Departmental oversight and compliance monitoring. |
| **Faculty Administrator** | Faculty-level reporting and administrative coordination. |
| **External Examiner** | Assessment and grading participation. |
| **System Administrator** | User management, department creation, settings, password resets, archive supervision. |

## Core User Flow

```
Login → Dashboard → Project → Task → Submit
```

### Post-Action Requirements

After every action: validation, audit logging, notifications, and workflow update.

### Exit Flow

Review updates and log out.

## Entry Point

Secure authentication via SSO or institutional credentials.

## First View

Personalized dashboard with pending actions.

## Permissions Model

- Strict role-based permissions with least privilege.
- Users access only information relevant to their assigned responsibilities.
- Users perform only authorized workflow actions within their role.
- Users must never access unauthorized records or bypass workflow approvals.

## Dashboard Requirements

### Student Dashboard

Immediately visible after login:
- Project stage
- Pending tasks
- Deadlines
- Feedback
- Meetings
- Notifications

### Supervisor Dashboard

Immediately visible after login:
- Pending topic approvals
- Pending reviews
- Meetings
- Supervisee progress
- Alerts

### Coordinator Dashboard

Immediately visible after login:
- Overall progress
- Overdue projects
- Supervisor workload
- Pending administrative actions
- Analytics

## Current State (To Be Replaced)

| Activity | Current Method |
|----------|---------------|
| Project assignment | Departments assign supervisors; supervisors approve research topics |
| Student-supervisor meetings | Physical meetings, email, or messaging platforms |
| Document submission | Email, printed copies, flash drives, or messaging apps |
| Feedback delivery | Handwritten notes, verbal discussions, email, or chat |
| Correction tracking | Mostly manual |
| Approvals | Signatures, emails, or verbal confirmation |
| Meeting scheduling | Mutual agreement between student and supervisor |
| Grading | Manual assessment using departmental rubrics |
| Final submission | Printed and digital submissions |
| Paperwork | Topic forms, approval sheets, assessment forms, grading sheets, submission forms |

## Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| Expected users | 10,000–500,000+ across multiple institutions |
| Performance | Average response time below 2 seconds under normal load |
| Max upload size | 200 MB (configurable) |
| Mobile support | Responsive web application with PWA support |
| Offline support | Limited offline drafting and synchronization |
| Accessibility | WCAG 2.2 AA compliance |
| Multi-campus | Yes |
| Multi-department | Yes |
| Scalability | Cloud-native, horizontally scalable, multi-tenant architecture |
| Backup & DR | Automated backups, geo-redundancy, tested disaster recovery procedures |

## Security Requirements

- RBAC (Role-Based Access Control)
- MFA (Multi-Factor Authentication)
- Encryption at rest and in transit
- Audit logs for all critical actions
- Secure APIs
- Rate limiting
- Backups
- Disaster recovery
- Data isolation between institutions

## Success Criteria

1. Reduced administrative workload.
2. Faster supervision cycles.
3. Higher completion rates.
4. Improved user satisfaction.
5. Institution-wide adoption.

## Future Vision (5 Years)

A comprehensive research lifecycle management platform for higher education.

## Postponed Features

- Native mobile apps
- AI writing assistance
- Plagiarism integration
- Institutional repositories
- Advanced predictive analytics
- Research funding management

## Future Possibilities

- Support for multiple institutions (multi-tenant)
- AI assistance for administrative tasks, summaries, feedback suggestions, scheduling, and analytics (preserving academic decision-making by supervisors)
- Support for theses, dissertations, and postgraduate research
- Integration with plagiarism detection and institutional repositories
