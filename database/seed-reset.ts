import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "node:url";
import { seedFixtures } from "./seed";

const prisma = new PrismaClient();

function assertEphemeralDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for db:seed:reset.");
  }

  const url = new URL(databaseUrl);
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (!allowedHosts.has(url.hostname)) {
    throw new Error(
      "db:seed:reset is only allowed against localhost or ephemeral DATABASE_URL values.",
    );
  }
}

async function wipeDatabase() {
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
}

async function main() {
  assertEphemeralDatabaseUrl();
  await wipeDatabase();
  await seedFixtures(prisma);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
