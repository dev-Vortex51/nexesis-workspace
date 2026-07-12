// Type definitions for database enums
// Auto-generated from Prisma schema

export type UserRole = "student" | "supervisor" | "coordinator" | "hod" | "admin" | "examiner";
export type UserStatus = "active" | "suspended" | "inactive";
export type SubscriptionTier = "free" | "standard" | "enterprise";
export type AcademicSessionStatus = "planning" | "active" | "closed" | "archived";
export type WorkflowStage = "registration" | "supervisor_assignment" | "topic_proposal" | "topic_approval" | "proposal" | "chapter_reviews" | "final_submission" | "supervisor_approval" | "defense" | "completion" | "archive";
export type StageStatus = "pending" | "in_review" | "approved" | "revision_requested";
export type ProjectMemberRole = "primary_supervisor" | "co_supervisor" | "examiner";
export type MilestoneStatus = "pending" | "overdue" | "completed";
export type DocumentType = "topic_proposal" | "proposal" | "chapter" | "report" | "assessment" | "defense" | "final_thesis" | "other";
export type FeedbackType = "inline_comment" | "general_comment" | "voice_note" | "annotation" | "approval_comment";
export type MeetingType = "physical" | "online";
export type MeetingStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type GradeStatus = "draft" | "submitted" | "approved" | "rejected";
export type AnnouncementPriority = "low" | "normal" | "high" | "urgent";
export type NotificationType = "workflow" | "deadline" | "meeting" | "grade" | "system";
export type NotificationChannel = "in_app" | "email" | "sms" | "push";
export type ReportType = "student_progress" | "supervisor_workload" | "department_performance" | "completion" | "grading" | "activity" | "compliance" | "audit";
export type ReportFormat = "pdf" | "excel";
export type ReportStatus = "queued" | "generating" | "completed" | "failed";
