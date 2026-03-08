const prisma = require("../../config/prisma");

exports.assignPackageToPatient = async (req, res) => {
  try {
    const { patientId, packageId } = req.body;

    if (!patientId || !packageId) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const [patient, pkg] = await Promise.all([
      prisma.patient.findUnique({ where: { id: patientId } }),
      prisma.package.findFirst({
        where: { id: packageId, isActive: true },
      }),
    ]);

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    if (!pkg) {
      return res.status(404).json({ message: "Package not found" });
    }

    const patientPackage = await prisma.patientPackage.create({
      data: {
        patientId,
        packageId,
      },
      include: {
        package: true,
      },
    });

    res.status(201).json(patientPackage);
  } catch (err) {
    console.error("🔥 PATIENT PACKAGE ASSIGN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPatientPackages = async (req, res) => {
  try {
    const { patientId } = req.params;

    const packages = await prisma.patientPackage.findMany({
      where: { patientId },
      include: {
        package: true,
        sessions: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const result = packages.map((pkg) => ({
      ...pkg,
      remainingSessions: pkg.package.totalSessions - pkg.usedSessions,
    }));

    res.json(result);
  } catch (err) {
    console.error("🔥 PATIENT PACKAGE LIST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAssignedPackage = async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await prisma.patientPackage.findUnique({
      where: { id },
      include: {
        package: true,
        sessions: true,
        patient: true,
      },
    });

    if (!pkg) {
      return res.status(404).json({ message: "Not found" });
    }

    const result = {
      ...pkg,
      remainingSessions: pkg.package.totalSessions - pkg.usedSessions,
    };

    res.json(result);
  } catch (err) {
    console.error("🔥 PATIENT PACKAGE GET ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
