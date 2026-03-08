const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  const hashedAdmin = await bcrypt.hash("admin123", 10);
  const hashedDoctor = await bcrypt.hash("doctor123", 10);
  const hashedStaff = await bcrypt.hash("staff123", 10);

  // =========================
  // ADMIN
  // =========================
  const admin = await prisma.user.upsert({
    where: { email: "admin@clinic.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "admin@clinic.com",
      password: hashedAdmin,
      role: "ADMIN",
      isActive: true,
    },
  });

  // =========================
  // BRANCH
  // =========================
  const branch = await prisma.branch.upsert({
    where: { name: "Main Branch" },
    update: {},
    create: {
      name: "Main Branch",
      address: "Downtown",
    },
  });

  // =========================
  // DOCTOR
  // =========================
  const doctor = await prisma.user.upsert({
    where: { email: "doctor@clinic.com" },
    update: {},
    create: {
      name: "Dr. Ahmed",
      email: "doctor@clinic.com",
      password: hashedDoctor,
      role: "DOCTOR",
      isActive: true,
    },
  });

  // =========================
  // STAFF
  // =========================
  const staff = await prisma.user.upsert({
    where: { email: "staff@clinic.com" },
    update: {},
    create: {
      name: "Reception Staff",
      email: "staff@clinic.com",
      password: hashedStaff,
      role: "STAFF",
      branchId: branch.id,
      isActive: true,
    },
  });

  // =========================
  // PATIENT
  // =========================
  const patient = await prisma.patient.create({
    data: {
      name: "Mohamed Ali",
      phone: "01012345678",
      notes: "Test patient",
    },
  });

  // =========================
  // PACKAGE TEMPLATE
  // =========================
  const pkg = await prisma.package.create({
    data: {
      name: "Physiotherapy 4 Sessions",
      totalSessions: 4,
      price: 1200,
    },
  });

  console.log("✅ Seed completed successfully!");
  console.log("Admin:", admin.email);
  console.log("Doctor:", doctor.email);
  console.log("Staff:", staff.email);
  console.log("Patient ID:", patient.id);
  console.log("Package ID:", pkg.id);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
