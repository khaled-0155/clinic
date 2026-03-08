const prisma = require("../../config/prisma");

// CREATE PACKAGE
exports.createPackage = async (req, res) => {
  try {
    const { name, totalSessions, price } = req.body;

    if (!name || !totalSessions || !price) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const pkg = await prisma.package.create({
      data: {
        name,
        totalSessions,
        price,
      },
    });

    res.status(201).json(pkg);
  } catch (err) {
    console.error("🔥 PACKAGE CREATE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPackages = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = req.query.search || "";
    const isActive = req.query.isActive;

    const skip = (page - 1) * limit;

    const where = {
      name: {
        contains: search,
        mode: "insensitive",
      },
    };

    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    const [packages, total] = await Promise.all([
      prisma.package.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              patientPackages: true,
            },
          },
        },
      }),

      prisma.package.count({ where }),
    ]);

    const data = packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      totalSessions: pkg.totalSessions,
      price: pkg.price,
      isActive: pkg.isActive,
      patientsCount: pkg._count.patientPackages,
      createdAt: pkg.createdAt,
    }));

    res.json({
      data,
      meta: {
        page,
        limit,
        total,
      },
    });
  } catch (err) {
    console.error("🔥 PACKAGE LIST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPackagePatients = async (req, res) => {
  try {
    const { id } = req.params;

    const assignments = await prisma.patientPackage.findMany({
      where: { packageId: id },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        package: {
          select: {
            totalSessions: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = assignments.map((a) => ({
      id: a.id,
      patientId: a.patient.id,
      patientName: a.patient.name,
      phone: a.patient.phone,
      total: a.package.totalSessions,
      used: a.usedSessions,
      remaining: a.package.totalSessions - a.usedSessions,
      createdAt: a.createdAt,
    }));

    res.json({ data });
  } catch (err) {
    console.error("🔥 PACKAGE PATIENTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.assignPatientToPackage = async (req, res) => {
  try {
    const { id } = req.params; // packageId
    const { patientId } = req.body;

    const [pkg, patient] = await Promise.all([
      prisma.package.findUnique({ where: { id } }),
      prisma.patient.findUnique({ where: { id: patientId } }),
    ]);

    if (!pkg) {
      return res.status(404).json({ message: "Package not found" });
    }

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const existing = await prisma.patientPackage.findFirst({
      where: {
        patientId,
        packageId: id,
      },
    });

    if (existing) {
      return res
        .status(400)
        .json({ message: "Patient already assigned to this package" });
    }

    const result = await prisma.$transaction(async (tx) => {
      // create patient package
      const patientPackage = await tx.patientPackage.create({
        data: {
          patientId,
          packageId: id,
        },
        include: {
          patient: true,
          package: true,
        },
      });

      // create transaction for package purchase
      const transaction = await tx.transaction.create({
        data: {
          type: "PACKAGE",
          amount: pkg.price,
          patientId,
          branchId: req.user.branchId, // staff branch
          createdById: req.user.id,
          notes: `Package purchase: ${pkg.name}`,
        },
      });

      return { patientPackage, transaction };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("🔥 ASSIGN PACKAGE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.removePatientFromPackage = async (req, res) => {
  try {
    const { id } = req.params;

    const assignment = await prisma.patientPackage.findUnique({
      where: { id },
      include: {
        package: true,
      },
    });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (assignment.usedSessions > 0) {
      return res.status(400).json({
        message: "Cannot remove patient. Sessions already used.",
      });
    }

    await prisma.$transaction(async (tx) => {
      // delete transaction related to package purchase
      await tx.transaction.deleteMany({
        where: {
          type: "PACKAGE",
          patientId: assignment.patientId,
          notes: {
            contains: assignment.package.name,
          },
        },
      });

      // delete patient package
      await tx.patientPackage.delete({
        where: { id },
      });
    });

    res.json({ message: "Patient removed from package" });
  } catch (err) {
    console.error("🔥 REMOVE PATIENT PACKAGE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPackageById = async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await prisma.package.findUnique({
      where: { id },

      include: {
        patientPackages: {
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },

            sessions: {
              select: {
                id: true,
                appointmentId: true,
                createdAt: true,
              },
            },

            appointments: {
              select: {
                id: true,
                date: true,
                startTime: true,
                status: true,
                price: true,
              },
            },
          },
        },
      },
    });

    if (!pkg) {
      return res.status(404).json({ message: "Package not found" });
    }

    // add remaining sessions calculation
    const formatted = {
      ...pkg,
      patientPackages: pkg.patientPackages.map((pp) => ({
        ...pp,
        remainingSessions: pkg.totalSessions - pp.usedSessions,
      })),
    };

    res.json(formatted);
  } catch (err) {
    console.error("🔥 PACKAGE GET ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updatePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, totalSessions, price, isActive } = req.body;

    const existing = await prisma.package.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Package not found",
      });
    }

    const pkg = await prisma.package.update({
      where: { id },
      data: {
        name,
        totalSessions,
        price,
        isActive,
      },
    });

    res.json(pkg);
  } catch (err) {
    console.error("🔥 PACKAGE UPDATE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deletePackage = async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await prisma.package.findUnique({
      where: { id },
      select: {
        id: true,
        totalSessions: true,
        patientPackages: {
          select: {
            id: true,
            usedSessions: true,
          },
        },
      },
    });

    if (!pkg) {
      return res.status(404).json({ message: "Package not found" });
    }

    const hasRemainingSessions = pkg.patientPackages.some(
      (pp) => pkg.totalSessions - pp.usedSessions > 0,
    );

    if (hasRemainingSessions) {
      return res.status(400).json({
        message:
          "Cannot delete package. Some patients still have remaining sessions.",
      });
    }

    await prisma.package.update({
      where: { id },
      data: {
        isActive: false,
      },
    });

    res.json({ message: "Package deactivated successfully" });
  } catch (err) {
    console.error("🔥 PACKAGE DELETE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
