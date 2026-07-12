import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.gradeComponent.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.rubricCriterion.deleteMany();
  await prisma.rubric.deleteMany();

  await prisma.feedback.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();

  await prisma.meetingNote.deleteMany();
  await prisma.meetingAttendance.deleteMany();
  await prisma.meeting.deleteMany();

  await prisma.message.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.report.deleteMany();

  await prisma.milestone.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();

  await prisma.user.deleteMany();
  await prisma.academicSession.deleteMany();
  await prisma.department.deleteMany();
  await prisma.institution.deleteMany();

  const institution = await prisma.institution.create({
    data: {
      name: "Nexesis University",
      slug: "nexesis-university",
      logoUrl: "https://example.com/logo.png",
      settings: {
        timezone: "Africa/Lagos",
        maxUploadMb: 200,
      },
      subscriptionTier: "standard",
    },
  });

  const department = await prisma.department.create({
    data: {
      institutionId: institution.id,
      name: "Computer Science",
      code: "CSC",
    },
  });

  const session = await prisma.academicSession.create({
    data: {
      institutionId: institution.id,
      name: "2025/2026 Session",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-07-31"),
      status: "active",
      settings: {
        topicProposalDeadline: "2025-10-01",
        finalSubmissionDeadline: "2026-05-30",
      },
    },
  });

  const [student, supervisor, coordinator, examiner] = await Promise.all([
    prisma.user.create({
      data: {
        institutionId: institution.id,
        departmentId: department.id,
        email: "student@nexesis.edu",
        passwordHash: "hashed_password_student",
        firstName: "Ada",
        lastName: "Student",
        role: "student",
        status: "active",
      },
    }),
    prisma.user.create({
      data: {
        institutionId: institution.id,
        departmentId: department.id,
        email: "supervisor@nexesis.edu",
        passwordHash: "hashed_password_supervisor",
        firstName: "Bayo",
        lastName: "Supervisor",
        role: "supervisor",
        status: "active",
      },
    }),
    prisma.user.create({
      data: {
        institutionId: institution.id,
        departmentId: department.id,
        email: "coordinator@nexesis.edu",
        passwordHash: "hashed_password_coordinator",
        firstName: "Chidi",
        lastName: "Coordinator",
        role: "coordinator",
        status: "active",
      },
    }),
    prisma.user.create({
      data: {
        institutionId: institution.id,
        departmentId: department.id,
        email: "examiner@nexesis.edu",
        passwordHash: "hashed_password_examiner",
        firstName: "Dara",
        lastName: "Examiner",
        role: "examiner",
        status: "active",
      },
    }),
  ]);

  const project = await prisma.project.create({
    data: {
      institutionId: institution.id,
      departmentId: department.id,
      sessionId: session.id,
      studentId: student.id,
      title: "AI-Assisted Academic Workflow Automation",
      description: "End-to-end project lifecycle automation platform.",
      currentStage: "topic_approval",
      stageStatus: "in_review",
      progress: 30,
      deadline: new Date("2026-01-15T12:00:00Z"),
    },
  });

  await prisma.projectMember.create({
    data: {
      projectId: project.id,
      userId: supervisor.id,
      role: "primary_supervisor",
    },
  });

  await prisma.projectMember.create({
    data: {
      projectId: project.id,
      userId: examiner.id,
      role: "examiner",
    },
  });

  await prisma.milestone.create({
    data: {
      projectId: project.id,
      name: "Topic Approval",
      stage: "topic_approval",
      deadline: new Date("2025-10-05T23:59:59Z"),
      status: "pending",
    },
  });

  const document = await prisma.document.create({
    data: {
      projectId: project.id,
      uploadedById: student.id,
      name: "Topic Proposals",
      type: "topic_proposal",
      cloudinaryPublicId: "nexesis/topic-proposals-v1",
      cloudinaryUrl:
        "https://res.cloudinary.com/demo/raw/upload/topic-proposals-v1.pdf",
      fileSize: 132455,
      mimeType: "application/pdf",
      currentVersion: 1,
    },
  });

  const version = await prisma.documentVersion.create({
    data: {
      documentId: document.id,
      versionNumber: 1,
      cloudinaryPublicId: "nexesis/topic-proposals-v1",
      cloudinaryUrl:
        "https://res.cloudinary.com/demo/raw/upload/topic-proposals-v1.pdf",
      fileSize: 132455,
      changeNotes: "Initial topic proposal submission",
    },
  });

  await prisma.feedback.create({
    data: {
      documentVersionId: version.id,
      authorId: supervisor.id,
      type: "approval_comment",
      content: "Topic 2 is promising. Refine scope before proposal stage.",
      pageNumber: 1,
      positionX: 0.34,
      positionY: 0.56,
    },
  });

  const meeting = await prisma.meeting.create({
    data: {
      projectId: project.id,
      scheduledById: supervisor.id,
      title: "Topic Clarification Meeting",
      type: "online",
      meetingUrl: "https://meet.example.com/nexesis-topic-review",
      scheduledAt: new Date("2025-09-25T10:00:00Z"),
      duration: 45,
      status: "scheduled",
      reminderSent: false,
    },
  });

  await prisma.meetingAttendance.createMany({
    data: [
      {
        meetingId: meeting.id,
        userId: supervisor.id,
        attended: false,
      },
      {
        meetingId: meeting.id,
        userId: student.id,
        attended: false,
      },
    ],
  });

  await prisma.meetingNote.create({
    data: {
      meetingId: meeting.id,
      authorId: supervisor.id,
      content: "Prepare a revised topic statement and supporting references.",
    },
  });

  const rubric = await prisma.rubric.create({
    data: {
      institutionId: institution.id,
      departmentId: department.id,
      name: "Default Research Rubric",
      description: "Baseline rubric for proposal and defense assessment.",
      isDefault: true,
    },
  });

  const criterion = await prisma.rubricCriterion.create({
    data: {
      rubricId: rubric.id,
      name: "Problem Definition",
      description: "Clarity and relevance of research problem.",
      maxScore: 20,
      weight: 1,
      order: 1,
    },
  });

  const grade = await prisma.grade.create({
    data: {
      projectId: project.id,
      rubricId: rubric.id,
      assessedById: examiner.id,
      totalScore: 16,
      maxScore: 20,
      percentage: 80,
      status: "submitted",
      approvedById: coordinator.id,
    },
  });

  await prisma.gradeComponent.create({
    data: {
      gradeId: grade.id,
      criterionId: criterion.id,
      score: 16,
      maxScore: 20,
      comment: "Clear statement with strong motivation.",
    },
  });

  await prisma.message.create({
    data: {
      projectId: project.id,
      senderId: student.id,
      content: "I have uploaded the revised topic document.",
      isRead: false,
    },
  });

  await prisma.announcement.create({
    data: {
      institutionId: institution.id,
      departmentId: department.id,
      sessionId: session.id,
      authorId: coordinator.id,
      title: "Topic Review Window",
      content: "All topic approvals must be completed by October 5.",
      priority: "high",
      expiresAt: new Date("2025-10-06T00:00:00Z"),
    },
  });

  await prisma.notification.create({
    data: {
      userId: student.id,
      type: "workflow",
      title: "Feedback Received",
      body: "Your topic proposal has new supervisor feedback.",
      actionUrl: "/projects/1/documents",
      isRead: false,
      sentVia: ["in_app", "email"],
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: institution.id,
      userId: supervisor.id,
      action: "topic_proposal_reviewed",
      entityType: "DocumentVersion",
      entityId: version.id,
      metadata: {
        result: "revision_requested",
        commentProvided: true,
      },
      ipAddress: "127.0.0.1",
      userAgent: "seed-script",
    },
  });

  await prisma.report.create({
    data: {
      institutionId: institution.id,
      generatedById: coordinator.id,
      type: "student_progress",
      format: "pdf",
      parameters: {
        sessionId: session.id,
        departmentId: department.id,
      },
      fileUrl: "https://reports.example.com/student-progress-2025-2026.pdf",
      status: "completed",
      completedAt: new Date("2026-01-10T08:30:00Z"),
    },
  });

  console.log(
    "Database seeded with sample institution, users, project, workflow artifacts, and reports.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
