// patients.controller.js

const prisma = require("../../config/prisma");

const createPatient = async (req, res) => {
  try {
    const { name, phone, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone required" });
    }

    const patient = await prisma.patient.create({
      data: {
        name,
        phone,
      },
    });

    // create first note if provided
    if (notes) {
      await prisma.patientNote.create({
        data: {
          patientId: patient.id,
          createdById: req.user.id,
          text: notes,
        },
      });
    }

    res.status(201).json(patient);
  } catch (error) {
    console.error("Create patient error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getPatients = async (req, res) => {
  try {
    const user = req.user;

    // 📌 Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 📌 Search
    const search = req.query.search || "";

    let where = {};

    // 🔍 Search by name or phone
    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          phone: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    // // 🔐 Role filtering
    // if (user.role === "DOCTOR") {
    //   where.appointments = {
    //     some: {
    //       doctorId: user.id,
    //     },
    //   };
    // }

    // STAFF & ADMIN → no restriction

    const [patients, total] = await prisma.$transaction([
      prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.patient.count({ where }),
    ]);

    res.json({
      data: patients,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get patients error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getPatientById = async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: true,
        packages: true,
      },
    });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json(patient);
  } catch (error) {
    console.error("Get patient error:", error);
    console.error("🔥 LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, notes } = req.body;

    const updated = await prisma.patient.update({
      where: { id },
      data: {
        name,
        phone,
        notes,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Update patient error:", error);
    console.error("🔥 LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const deletePatient = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Only admin can delete" });
    }

    await prisma.patient.delete({
      where: { id },
    });

    res.json({ message: "Patient deleted" });
  } catch (error) {
    console.error("Delete patient error:", error);
    console.error("🔥 LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const addPatientNote = async (req, res) => {
  try {
    const { id } = req.params; // patientId
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Note text required" });
    }

    const note = await prisma.patientNote.create({
      data: {
        patientId: id,
        createdById: req.user.id,
        text,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    res.status(201).json(note);
  } catch (error) {
    console.error("Add patient note error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getPatientNotes = async (req, res) => {
  try {
    const { id } = req.params;

    const notes = await prisma.patientNote.findMany({
      where: { patientId: id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(notes);
  } catch (error) {
    console.error("Get patient notes error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const deletePatientNote = async (req, res) => {
  try {
    const { noteId } = req.params;

    await prisma.patientNote.delete({
      where: { id: noteId },
    });

    res.json({ message: "Note deleted" });
  } catch (error) {
    console.error("Delete patient note error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getPatientAppointments = async (req, res) => {
  try {
    const { id } = req.params;

    const appointments = await prisma.appointment.findMany({
      where: { patientId: id },
      include: {
        doctor: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        package: {
          include: {
            package: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    res.json(appointments);
  } catch (error) {
    console.error("Get patient appointments error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getPatientSessions = async (req, res) => {
  try {
    const { id } = req.params;

    const sessions = await prisma.session.findMany({
      where: {
        appointment: {
          patientId: id,
        },
      },
      include: {
        appointment: {
          include: {
            doctor: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
          },
        },
        package: {
          include: {
            package: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const data = sessions.map((s) => ({
      id: s.id,
      date: s.appointment.date,
      startTime: s.appointment.startTime,
      endTime: s.appointment.endTime,
      doctor: s.appointment.doctor,
      branch: s.appointment.branch,
      packageName: s.package.package.name,
      used: s.package.usedSessions,
      total: s.package.package.totalSessions,
    }));

    res.json(data);
  } catch (error) {
    console.error("Get patient sessions error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getPatientPackages = async (req, res) => {
  try {
    const { id } = req.params;

    const packages = await prisma.patientPackage.findMany({
      where: {
        patientId: id,
      },
      include: {
        package: true,
        sessions: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const result = packages.map((p) => {
      const total = p.package.totalSessions;
      const used = p.usedSessions;
      const remaining = total - used;

      return {
        id: p.id,
        name: p.package.name,
        total,
        used,
        remaining,
        price: p.package.price,
        createdAt: p.createdAt,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Get patient packages error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
module.exports = {
  createPatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  addPatientNote,
  deletePatientNote,
  getPatientNotes,
  getPatientAppointments,
  getPatientSessions,
  getPatientPackages,
};
