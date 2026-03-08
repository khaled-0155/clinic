// controllers/scheduleController.js
const prisma = require("../../config/prisma");

const {
  timePartsFromDate,
  buildUtcDateForDay,
  generateSlotsBetween,
  overlaps,
} = require("../../utils/slots");

const WEEKDAY_ENUM = {
  monday: "MONDAY",
  tuesday: "TUESDAY",
  wednesday: "WEDNESDAY",
  thursday: "THURSDAY",
  friday: "FRIDAY",
  saturday: "SATURDAY",
  sunday: "SUNDAY",
};

async function createSchedule(req, res) {
  try {
    const {
      doctorId,
      branchId,
      weekDay,
      startTime,
      endTime,
      isActive = true,
    } = req.body;

    if (!doctorId || !branchId || !weekDay || !startTime || !endTime) {
      return res.status(400).json({
        message: "doctorId, branchId, weekDay, startTime and endTime required",
      });
    }

    // Convert HH:mm → fixed UTC date
    const start = new Date(`1970-01-01T${startTime}:00Z`);
    const end = new Date(`1970-01-01T${endTime}:00Z`);

    if (start >= end) {
      return res.status(400).json({
        message: "End time must be after start time",
      });
    }

    // 🔥 OVERLAP CHECK (same doctor + same weekday)
    const overlap = await prisma.doctorSchedule.findFirst({
      where: {
        doctorId,
        weekDay,
        AND: [
          {
            startTime: { lt: end },
          },
          {
            endTime: { gt: start },
          },
        ],
      },
    });

    if (overlap) {
      return res.status(400).json({
        message: "Schedule overlaps with existing schedule for this doctor",
      });
    }

    const schedule = await prisma.doctorSchedule.create({
      data: {
        doctorId,
        branchId,
        weekDay,
        startTime: start,
        endTime: end,
        isActive,
      },
    });

    return res.status(201).json(schedule);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "createSchedule error",
      error: err.message,
    });
  }
}

async function updateSchedule(req, res) {
  try {
    const { id } = req.params;
    const data = {};
    const { startTime, endTime, isActive, weekDay } = req.body;
    if (startTime) data.startTime = new Date(`1970-01-01T${startTime}:00Z`);
    if (endTime) data.endTime = new Date(`1970-01-01T${endTime}:00Z`);
    if (typeof isActive !== "undefined") data.isActive = isActive;
    if (weekDay) data.weekDay = weekDay;
    const updated = await prisma.doctorSchedule.update({
      where: { id },
      data,
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "updateSchedule error", error: err.message });
  }
}

async function deleteSchedule(req, res) {
  try {
    const { id } = req.params;
    await prisma.doctorSchedule.delete({ where: { id } });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "deleteSchedule error", error: err.message });
  }
}

async function listSchedulesForDoctor(req, res) {
  try {
    const { doctorId, branchId } = req.query;

    const where = {};
    if (doctorId) where.doctorId = doctorId;
    if (branchId) where.branchId = branchId;

    const schedules = await prisma.doctorSchedule.findMany({
      where,
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
      orderBy: [{ weekDay: "asc" }, { startTime: "asc" }],
    });

    return res.json(schedules);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "listSchedulesForDoctor error",
      error: err.message,
    });
  }
}

/* Exceptions CRUD */
async function createException(req, res) {
  try {
    const { doctorId, branchId, date, isAvailable } = req.body;
    if (!doctorId || !branchId || !date || typeof isAvailable === "undefined") {
      return res
        .status(400)
        .json({ message: "doctorId, branchId, date, isAvailable required" });
    }
    const exception = await prisma.doctorScheduleException.create({
      data: {
        doctorId,
        branchId,
        date: new Date(`${date}T00:00:00.000Z`),
        isAvailable,
      },
    });
    return res.status(201).json(exception);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "createException error", error: err.message });
  }
}

async function updateException(req, res) {
  try {
    const { id } = req.params;
    const data = {};
    const { date, isAvailable } = req.body;
    if (date) data.date = new Date(date);
    if (typeof isAvailable !== "undefined") data.isAvailable = isAvailable;
    const updated = await prisma.doctorScheduleException.update({
      where: { id },
      data,
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "updateException error", error: err.message });
  }
}

async function deleteException(req, res) {
  try {
    const { id } = req.params;
    await prisma.doctorScheduleException.delete({ where: { id } });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "deleteException error", error: err.message });
  }
}

/**
 * GET /slots?doctorId=...&branchId=...&date=YYYY-MM-DD&slotLength=30
 *
 * Steps:
 * 1. Find weekly schedules for the doctor's weekday.
 * 2. Check for doctorScheduleException for the date — if exists and isAvailable===false => return [].
 * 3. For each schedule, build slots (slotLength minutes).
 * 4. Fetch existing appointments for that doctor/branch/date and remove overlapping slots.
 * 5. Return slots with status 'available' | 'booked' and meta (start,end ISO).
 */
async function getSlots(req, res) {
  try {
    const { doctorId, branchId, date, slotLength = 30 } = req.query;
    if (!doctorId || !branchId || !date) {
      return res
        .status(400)
        .json({ message: "doctorId, branchId and date required (YYYY-MM-DD)" });
    }

    // Parse requested date and weekday
    const requestedDate = new Date(`${date}T00:00:00Z`);
    const weekdayIndex = requestedDate.getUTCDay(); // 0=Sunday ... 6=Saturday
    // Map JS day to WeekDay enum
    const jsToEnum = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ];
    const weekDayEnum = jsToEnum[weekdayIndex];

    // 1) get schedules for that weekday
    const schedules = await prisma.doctorSchedule.findMany({
      where: {
        doctorId,
        branchId,
        weekDay: weekDayEnum,
        isActive: true,
      },
      orderBy: [{ startTime: "asc" }],
    });

    // 2) check exceptions
    const exception = await prisma.doctorScheduleException.findFirst({
      where: {
        doctorId,
        branchId,
        date: new Date(date), // equality by exact date-time: we'll assume caller uses midnight UTC
      },
    });

    if (exception && exception.isAvailable === false) {
      // day blocked
      return res.json({ slots: [], reason: "blocked_by_exception" });
    }

    // 3) build slots from schedules
    let candidateSlots = [];
    for (const s of schedules) {
      // extract time parts from stored placeholder Date
      const { hours: sh, minutes: sm } = timePartsFromDate(s.startTime);
      const { hours: eh, minutes: em } = timePartsFromDate(s.endTime);

      const slotStart = buildUtcDateForDay(date, sh, sm);
      const slotEnd = buildUtcDateForDay(date, eh, em);
      if (slotEnd <= slotStart) continue; // skip invalid ranges

      const slots = generateSlotsBetween(
        slotStart,
        slotEnd,
        Number(slotLength),
      );
      candidateSlots = candidateSlots.concat(slots);
    }

    // 4) fetch appointments on that date for doctor+branch (appointments contain full date/time)
    // Match appointments whose date equals requested date (same day in UTC)
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    const appts = await prisma.appointment.findMany({
      where: {
        doctorId,
        branchId,
        date: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });

    // Convert appointments into intervals
    const apptIntervals = appts.map((a) => ({
      start: new Date(a.startTime),
      end: new Date(a.endTime),
      id: a.id,
    }));

    // 5) mark slots as booked if overlapping any appointment
    const slotsWithStatus = candidateSlots.map((slot) => {
      const isBooked = apptIntervals.some((ap) =>
        overlaps(ap.start, ap.end, slot.start, slot.end),
      );
      return {
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        status: isBooked ? "booked" : "available",
      };
    });

    // Optionally, if exception exists AND isAvailable === true, we could add extra ad-hoc rules.
    // For now we treat isAvailable === true as override allowing slots (no blocking).
    return res.json({ slots: slotsWithStatus });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "getSlots error", error: err.message });
  }
}

module.exports = {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  listSchedulesForDoctor,
  createException,
  updateException,
  deleteException,
  getSlots,
};
