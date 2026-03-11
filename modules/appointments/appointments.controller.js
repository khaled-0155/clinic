// controllers/appointments.controller.js
const prisma = require("../../config/prisma");

function setTimeOnDateUTC(dateOnly, timeSource) {
  const d = new Date(dateOnly);

  d.setUTCHours(timeSource.getUTCHours(), timeSource.getUTCMinutes(), 0, 0);
  return d;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

const getSlots = async (req, res) => {
  try {
    const { doctorId, branchId, date, includePast } = req.query;

    if (!doctorId || !branchId || !date) {
      return res
        .status(400)
        .json({ message: "doctorId, branchId and date are required" });
    }

    const requestedDay = new Date(`${date}T00:00:00Z`);

    const weekdayNames = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ];

    const weekday = weekdayNames[requestedDay.getUTCDay()];

    // Exception check
    const exception = await prisma.doctorScheduleException.findFirst({
      where: {
        doctorId,
        branchId,
        date: requestedDay,
      },
    });

    if (exception && exception.isAvailable === false) {
      return res.json({ availabilityBlocks: [], slots: [] });
    }

    const schedules = await prisma.doctorSchedule.findMany({
      where: {
        doctorId,
        branchId,
        weekDay: weekday,
        isActive: true,
      },
      orderBy: { startTime: "asc" },
    });

    if (!schedules.length) {
      return res.json({ availabilityBlocks: [], slots: [] });
    }

    const startOfDay = new Date(`${date}T00:00:00Z`);
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        branchId,
        date: {
          gte: startOfDay,
          lt: endOfDay,
        },
        status: { not: "CANCELLED" },
      },
      include: { patient: true },
    });

    // Precompute appointment intervals
    const appointmentIntervals = appointments.map((a) => ({
      start: new Date(a.startTime),
      end: new Date(a.endTime),
      data: a,
    }));

    const now = new Date();
    const showPast = includePast === "true";

    const slots = [];
    const availabilityBlocks = [];

    for (const sch of schedules) {
      const blockStart = setTimeOnDateUTC(
        requestedDay,
        new Date(sch.startTime),
      );

      const blockEnd = setTimeOnDateUTC(requestedDay, new Date(sch.endTime));

      if (blockEnd <= blockStart) continue;

      availabilityBlocks.push({
        id: sch.id,
        startTime: blockStart.toISOString(),
        endTime: blockEnd.toISOString(),
      });

      const slotLengthMs = (sch.slotMinutes || 30) * 60 * 1000;

      let slotStart = new Date(blockStart);

      while (slotStart.getTime() + slotLengthMs <= blockEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + slotLengthMs);

        if (!showPast && slotEnd <= now) {
          slotStart = slotEnd;
          continue;
        }

        let bookedAppt = null;

        for (const appt of appointmentIntervals) {
          if (appt.start < slotEnd && appt.end > slotStart) {
            bookedAppt = appt.data;
            break;
          }
        }

        slots.push({
          doctorId,
          branchId,
          date: isoDay(requestedDay),
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          status: bookedAppt ? "BOOKED" : "AVAILABLE",
          appointment: bookedAppt
            ? {
                id: bookedAppt.id,
                patientId: bookedAppt.patientId,
                patientName: bookedAppt.patient?.name || null,
                status: bookedAppt.status,
                startTime: bookedAppt.startTime,
                endTime: bookedAppt.endTime,
              }
            : null,
        });

        slotStart = slotEnd;
      }
    }

    res.json({ availabilityBlocks, slots });
  } catch (error) {
    console.error("getSlots error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const createAppointment = async (req, res) => {
  try {
    const {
      doctorId,
      branchId,
      patientId,
      date,
      slotStarts,
      packageId,
      price,
    } = req.body;

    const user = req.user;

    if (!slotStarts || !Array.isArray(slotStarts) || slotStarts.length === 0) {
      return res.status(400).json({ message: "No slots selected" });
    }

    // ROLE CHECKS
    if (user.role === "STAFF" && user.branchId !== branchId) {
      return res
        .status(403)
        .json({ message: "Staff can only book in their branch" });
    }

    if (user.role === "DOCTOR" && user.id !== doctorId) {
      return res
        .status(403)
        .json({ message: "Doctor can only book for himself" });
    }

    if (!packageId && (price === undefined || price === null)) {
      return res
        .status(400)
        .json({ message: "Price is required for non-package appointment" });
    }

    const requestedDay = new Date(`${date}T00:00:00Z`);

    const exception = await prisma.doctorScheduleException.findFirst({
      where: { doctorId, branchId, date: requestedDay },
    });

    if (exception && exception.isAvailable === false) {
      return res
        .status(400)
        .json({ message: "Doctor is unavailable on this date" });
    }

    const weekdayNames = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ];

    const weekday = weekdayNames[requestedDay.getUTCDay()];

    const schedules = await prisma.doctorSchedule.findMany({
      where: {
        doctorId,
        branchId,
        weekDay: weekday,
        isActive: true,
      },
    });

    if (!schedules.length) {
      return res
        .status(400)
        .json({ message: "Doctor has no schedule on that weekday" });
    }

    // convert slotStarts to Date
    const slots = slotStarts.map((s) => new Date(s)).sort((a, b) => a - b);

    const firstSlot = slots[0];

    let selectedSchedule = null;
    let slotMinutes = 30;

    for (const sch of schedules) {
      const blockStart = setTimeOnDateUTC(
        requestedDay,
        new Date(sch.startTime),
      );

      const blockEnd = setTimeOnDateUTC(requestedDay, new Date(sch.endTime));

      if (firstSlot >= blockStart && firstSlot < blockEnd) {
        selectedSchedule = sch;
        slotMinutes = sch.slotMinutes || 30;
        break;
      }
    }

    if (!selectedSchedule) {
      return res
        .status(400)
        .json({ message: "Slots outside schedule availability" });
    }

    // Validate slot alignment + consecutive slots
    const blockStart = setTimeOnDateUTC(
      requestedDay,
      new Date(selectedSchedule.startTime),
    );

    for (let i = 0; i < slots.length; i++) {
      const diff = (slots[i] - blockStart) / 60000;

      if (diff % slotMinutes !== 0) {
        return res.status(400).json({
          message: `Invalid slot alignment (${slotMinutes} minutes required)`,
        });
      }

      if (i > 0) {
        const gap = (slots[i] - slots[i - 1]) / 60000;

        if (gap !== slotMinutes) {
          return res.status(400).json({
            message: "Slots must be consecutive",
          });
        }
      }
    }

    const start = slots[0];
    const end = new Date(
      slots[slots.length - 1].getTime() + slotMinutes * 60000,
    );

    const now = new Date();

    if (end <= now) {
      return res.status(400).json({ message: "Cannot book past time slot" });
    }

    // Check overlapping appointments
    const overlapping = await prisma.appointment.findFirst({
      where: {
        doctorId,
        branchId,
        date: requestedDay,
        status: { not: "CANCELLED" },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });

    if (overlapping) {
      return res.status(400).json({
        message: "One or more slots already booked",
      });
    }

    const appointment = await prisma.appointment.create({
      data: {
        doctorId,
        branchId,
        patientId,
        date: requestedDay,
        startTime: start,
        endTime: end,
        packageId: packageId || null,
        price: packageId ? null : Number(price),
      },
    });

    res.status(201).json(appointment);
  } catch (error) {
    console.error("Create appointment error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, doctorNotes, cancelReason } = req.body;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        package: true,
        transaction: true,
      },
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const updateData = {
      status,
    };

    if (doctorNotes) updateData.doctorNotes = doctorNotes;
    if (cancelReason) updateData.cancelReason = cancelReason;

    const updated = await prisma.appointment.update({
      where: { id },
      data: updateData,
    });

    /**
     * When appointment completed
     */
    if (status === "COMPLETED") {
      // CASE 1 → PACKAGE SESSION
      if (appointment.packageId) {
        await prisma.$transaction([
          prisma.session.create({
            data: {
              appointmentId: appointment.id,
              packageId: appointment.packageId,
            },
          }),

          prisma.patientPackage.update({
            where: { id: appointment.packageId },
            data: {
              usedSessions: {
                increment: 1,
              },
            },
          }),
        ]);
      }

      // CASE 2 → SINGLE APPOINTMENT PAYMENT
      else if (!appointment.transaction) {
        await prisma.transaction.create({
          data: {
            type: "APPOINTMENT",
            amount: appointment.price || 0,
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            branchId: appointment.branchId,
            createdById: req.user.id,
          },
        });
      }
    }

    res.json(updated);
  } catch (err) {
    console.error("🔥 APPOINTMENT STATUS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const completeAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { id },
        include: {
          package: true,
          session: true,
        },
      });

      if (!appointment) throw new Error("Appointment not found");

      // Doctor restriction
      if (user.role === "DOCTOR" && appointment.doctorId !== user.id)
        throw new Error("Not allowed");

      if (appointment.status === "COMPLETED")
        throw new Error("Already completed");

      // If linked to package
      if (appointment.packageId) {
        if (!appointment.package) throw new Error("Package not found");

        if (appointment.session) throw new Error("Session already created");

        if (
          appointment.package.usedSessions >= appointment.package.totalSessions
        )
          throw new Error("No remaining sessions in package");

        // Create session FIRST
        await tx.session.create({
          data: {
            appointmentId: id,
            packageId: appointment.packageId,
          },
        });

        // Then increment package safely
        await tx.patientPackage.update({
          where: { id: appointment.packageId },
          data: {
            usedSessions: { increment: 1 },
          },
        });
      }

      // Finally update appointment status
      await tx.appointment.update({
        where: { id },
        data: { status: "COMPLETED" },
      });
    });

    res.json({ message: "Appointment completed successfully" });
  } catch (error) {
    console.error("Complete appointment error:", error);
    res.status(400).json({ message: error.message });
  }
};

const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    res.json({ message: "Appointment cancelled" });
  } catch (error) {
    console.error("Cancel appointment error:", error);
    console.error("🔥 LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getAppointments = async (req, res) => {
  try {
    const user = req.user;

    let {
      page = 1,
      limit = 10,
      status,
      branchId,
      doctorId,
      patientId,
      from,
      to,
      search,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(parseInt(limit) || 10, 100);

    const skip = (page - 1) * limit;

    const where = {};

    // ROLE FILTER
    if (user.role === "DOCTOR") {
      where.doctorId = user.id;
    }

    if (user.role === "STAFF") {
      where.branchId = user.branchId;
    }

    if (user.role === "ADMIN") {
      if (branchId) where.branchId = branchId;
      if (doctorId) where.doctorId = doctorId;
    }

    if (status) where.status = status;
    if (patientId) where.patientId = patientId;

    // Date range
    if (from || to) {
      const dateFilter = {};

      if (from) dateFilter.gte = new Date(`${from}T00:00:00Z`);

      if (to) {
        const end = new Date(`${to}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        dateFilter.lt = end;
      }

      where.date = dateFilter;
    }

    // Search patient
    if (search) {
      where.patient = {
        name: {
          contains: search,
          mode: "insensitive",
        },
      };
    }

    // Safe sorting
    const allowedSort = ["createdAt", "date", "startTime", "status"];
    if (!allowedSort.includes(sortBy)) sortBy = "createdAt";

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,

        include: {
          doctor: { select: { id: true, name: true } },

          patient: { select: { id: true, name: true, phone: true } },

          branch: { select: { id: true, name: true } },

          package: {
            select: {
              id: true,
              package: {
                select: { name: true },
              },
            },
          },

          transaction: {
            select: {
              id: true,
              amount: true,
            },
          },

          medicalRecord: {
            select: {
              id: true,
              diagnosis: true,
            },
          },
        },

        orderBy: {
          [sortBy]: order === "asc" ? "asc" : "desc",
        },

        skip,
        take: limit,
      }),

      prisma.appointment.count({ where }),
    ]);

    const data = appointments.map((a) => {
      const durationMinutes =
        (new Date(a.endTime) - new Date(a.startTime)) / 60000;

      return {
        ...a,
        durationMinutes,
      };
    });

    res.json({
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get appointments error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const appointment = await prisma.appointment.findUnique({
      where: { id },

      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },

        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            createdAt: true,
          },
        },

        branch: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },

        package: {
          select: {
            id: true,
            usedSessions: true,
            package: {
              select: {
                id: true,
                name: true,
                totalSessions: true,
                price: true,
              },
            },
          },
        },

        session: {
          select: {
            id: true,
            createdAt: true,
          },
        },

        transaction: {
          select: {
            id: true,
            amount: true,
            createdAt: true,
          },
        },

        medicalRecord: {
          select: {
            id: true,
            diagnosis: true,
            treatment: true,
            prescription: true,
            notes: true,
            createdAt: true,
          },
        },

        progress: {
          include: {
            doctor: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found",
      });
    }

    // ROLE SECURITY
    if (user.role === "DOCTOR" && appointment.doctorId !== user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (user.role === "STAFF" && appointment.branchId !== user.branchId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const durationMinutes =
      (new Date(appointment.endTime) - new Date(appointment.startTime)) / 60000;

    res.json({
      ...appointment,
      durationMinutes,
    });
  } catch (error) {
    console.error("Get appointment by id error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const addAppointmentProgress = async (req, res) => {
  try {
    const { id } = req.params;

    const { progressNote, painLevel, mobilityScore } = req.body;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { progress: true },
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (appointment.progress) {
      return res
        .status(400)
        .json({ message: "Progress already exists for this appointment" });
    }

    const progress = await prisma.medicalProgress.create({
      data: {
        appointmentId: id,
        doctorId: req.user.id,
        progressNote,
        painLevel,
        mobilityScore,
      },
    });

    res.json(progress);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateAppointmentProgress = async (req, res) => {
  try {
    const { id } = req.params;

    const { progressNote, painLevel, mobilityScore } = req.body;

    const progress = await prisma.medicalProgress.update({
      where: { appointmentId: id },
      data: {
        progressNote,
        painLevel,
        mobilityScore,
      },
    });

    res.json(progress);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAppointmentProgress = async (req, res) => {
  try {
    const { id } = req.params;

    const progress = await prisma.medicalProgress.findUnique({
      where: { appointmentId: id },
      include: {
        doctor: {
          select: { id: true, name: true },
        },
      },
    });

    res.json(progress);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        transaction: true,
      },
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Allow delete only if BOOKED or CANCELLED
    if (!["BOOKED", "CANCELLED"].includes(appointment.status)) {
      return res.status(400).json({
        message: "Only booked or cancelled appointments can be deleted",
      });
    }

    // Optional safety check (if transaction exists)
    if (appointment.transaction) {
      return res.status(400).json({
        message: "Cannot delete appointment with transaction",
      });
    }

    await prisma.appointment.delete({
      where: { id },
    });

    res.json({ message: "Appointment deleted successfully" });
  } catch (error) {
    console.error("Delete appointment error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createAppointment,
  completeAppointment,
  cancelAppointment,
  getSlots,
  getAppointments,
  updateAppointmentStatus,
  getAppointmentById,
  addAppointmentProgress,
  updateAppointmentProgress,
  getAppointmentProgress,
  deleteAppointment,
};
