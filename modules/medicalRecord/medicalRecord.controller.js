const prisma = require("../../config/prisma");

// Create medical record
const createMedicalRecord = async (req, res) => {
  try {
    const {
      patientId,
      appointmentId,
      diagnosis,
      treatment,
      prescription,
      notes,
    } = req.body;

    const doctorId = req.user.id;

    // check appointment exists
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // prevent duplicate
    const existing = await prisma.medicalRecord.findUnique({
      where: { appointmentId },
    });

    if (existing) {
      return res.status(400).json({
        message: "Medical record already exists for this appointment",
      });
    }

    const record = await prisma.medicalRecord.create({
      data: {
        patientId,
        appointmentId,
        doctorId,
        diagnosis,
        treatment,
        prescription,
        notes,
      },
    });

    res.status(201).json(record);
  } catch (error) {
    console.error("Create medical record error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get patient medical records
const getPatientMedicalRecords = async (req, res) => {
  try {
    const { patientId } = req.params;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;

    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      prisma.medicalRecord.findMany({
        where: { patientId },
        include: {
          doctor: { select: { id: true, name: true } },
          appointment: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),

      prisma.medicalRecord.count({
        where: { patientId },
      }),
    ]);

    res.json({
      data: records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get single record
const getMedicalRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await prisma.medicalRecord.findUnique({
      where: { id },
      include: {
        doctor: { select: { id: true, name: true } },
        patient: true,
        appointment: true,
        progressNotes: true,
      },
    });

    if (!record) {
      return res.status(404).json({ message: "Medical record not found" });
    }

    res.json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update record
const updateMedicalRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { diagnosis, treatment, prescription, notes } = req.body;

    const record = await prisma.medicalRecord.update({
      where: { id },
      data: {
        diagnosis,
        treatment,
        prescription,
        notes,
      },
    });

    res.json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete record
const deleteMedicalRecord = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.medicalRecord.delete({
      where: { id },
    });

    res.json({ message: "Medical record deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  createMedicalRecord,
  getPatientMedicalRecords,
  getMedicalRecord,
  updateMedicalRecord,
  deleteMedicalRecord,
};
