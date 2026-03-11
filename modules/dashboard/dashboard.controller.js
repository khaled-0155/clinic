const prisma = require("../../config/prisma");
const dayjs = require("dayjs");

exports.getStats = async (req, res) => {
  try {
    const { period = "week" } = req.query;

    let startDate;
    let prevStartDate;

    switch (period) {
      case "day":
        startDate = dayjs().startOf("day");
        prevStartDate = dayjs().subtract(1, "day").startOf("day");
        break;

      case "week":
        startDate = dayjs().startOf("week");
        prevStartDate = dayjs().subtract(1, "week").startOf("week");
        break;

      case "month":
        startDate = dayjs().startOf("month");
        prevStartDate = dayjs().subtract(1, "month").startOf("month");
        break;

      case "year":
        startDate = dayjs().startOf("year");
        prevStartDate = dayjs().subtract(1, "year").startOf("year");
        break;
    }

    const now = dayjs();

    const [
      patients,
      appointments,
      revenue,
      prevPatients,
      prevAppointments,
      prevRevenue,
    ] = await Promise.all([
      prisma.patient.count({
        where: { createdAt: { gte: startDate.toDate() } },
      }),

      prisma.appointment.count({
        where: { createdAt: { gte: startDate.toDate() } },
      }),

      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: {
          createdAt: { gte: startDate.toDate() },
          type: { in: ["APPOINTMENT", "PACKAGE"] },
        },
      }),

      prisma.patient.count({
        where: {
          createdAt: {
            gte: prevStartDate.toDate(),
            lt: startDate.toDate(),
          },
        },
      }),

      prisma.appointment.count({
        where: {
          createdAt: {
            gte: prevStartDate.toDate(),
            lt: startDate.toDate(),
          },
        },
      }),

      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: {
          createdAt: {
            gte: prevStartDate.toDate(),
            lt: startDate.toDate(),
          },
          type: { in: ["APPOINTMENT", "PACKAGE"] },
        },
      }),
    ]);

    const calcChange = (current, prev) => {
      if (!prev || prev === 0) return "+100%";

      const diff = ((current - prev) / prev) * 100;

      return `${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%`;
    };

    const currentRevenue = Number(revenue?._sum?.amount) || 0;
    const previousRevenue = Number(prevRevenue?._sum?.amount) || 0;

    res.json({
      patients: {
        value: Number(patients) || 0,
        change: calcChange(patients, prevPatients),
      },

      appointments: {
        value: Number(appointments) || 0,
        change: calcChange(appointments, prevAppointments),
      },

      revenue: {
        value: currentRevenue,
        change: calcChange(currentRevenue, previousRevenue),
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAppointmentStatistics = async (req, res) => {
  try {
    const { period = "monthly" } = req.query;

    let startDate;
    let groupFormat;

    if (period === "daily") {
      startDate = dayjs().subtract(30, "day").startOf("day");
      groupFormat = "YYYY-MM-DD";
    }

    if (period === "monthly") {
      startDate = dayjs().subtract(12, "month").startOf("month");
      groupFormat = "YYYY-MM";
    }

    if (period === "yearly") {
      startDate = dayjs().subtract(5, "year").startOf("year");
      groupFormat = "YYYY";
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        createdAt: {
          gte: startDate.toDate(),
        },
      },
      select: {
        status: true,
        createdAt: true,
      },
    });

    const chartMap = {};

    appointments.forEach((a) => {
      const key = dayjs(a.createdAt).format(groupFormat);

      if (!chartMap[key]) {
        chartMap[key] = {
          label: key,
          completed: 0,
          booked: 0,
          cancelled: 0,
        };
      }

      if (a.status === "COMPLETED") chartMap[key].completed++;
      if (a.status === "BOOKED") chartMap[key].booked++;
      if (a.status === "CANCELLED") chartMap[key].cancelled++;
    });

    const chart = Object.values(chartMap);

    const [all, completed, cancelled] = await Promise.all([
      prisma.appointment.count(),
      prisma.appointment.count({
        where: { status: "COMPLETED" },
      }),
      prisma.appointment.count({
        where: { status: "CANCELLED" },
      }),
    ]);

    res.json({
      summary: {
        all,
        completed,
        cancelled,
      },
      chart,
    });
  } catch (error) {
    console.error("Appointment statistics error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAppointmentsWidget = async (req, res) => {
  try {
    const { date, status } = req.query;

    const selectedDate = date ? dayjs(date) : dayjs();

    const start = selectedDate.startOf("month").toDate();
    const end = selectedDate.endOf("month").toDate();

    const where = {
      date: {
        gte: start,
        lte: end,
      },
    };

    if (status) {
      where.status = status.toUpperCase();
    }

    const appointments = await prisma.appointment.findMany({
      where,
      select: {
        id: true,
        date: true,
        status: true,

        patient: { select: { name: true } },
        doctor: { select: { name: true } },

        slots: {
          include: {
            slot: true,
          },
        },
      },
      orderBy: {
        date: "asc",
      },
    });

    const grouped = {};

    for (const a of appointments) {
      const day = dayjs(a.date).format("YYYY-MM-DD");

      if (!grouped[day]) grouped[day] = [];

      const sortedSlots = a.slots
        .map((s) => s.slot)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      const startTime = sortedSlots[0]?.startTime || null;
      const endTime = sortedSlots[sortedSlots.length - 1]?.endTime || null;

      grouped[day].push({
        id: a.id,
        patient: a.patient?.name || null,
        doctor: a.doctor?.name || null,
        startTime: startTime ? dayjs(startTime).format("HH:mm") : null,
        endTime: endTime ? dayjs(endTime).format("HH:mm") : null,
        status: a.status,
      });
    }

    res.json(grouped);
  } catch (error) {
    console.error("Widget appointments error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getRecentTransactions = async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      take: 10,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        patient: {
          select: { name: true },
        },
        appointment: {
          select: {
            id: true,
          },
        },
        branch: {
          select: { name: true },
        },
      },
    });

    const result = transactions.map((t) => ({
      id: t.id,
      title:
        t.type === "EXPENSE"
          ? "Expense"
          : t.appointmentId
            ? "Appointment Payment"
            : "Package Payment",

      invoice: `#${t.id.slice(0, 6)}`,

      provider: t.type === "EXPENSE" ? "expense" : "income",

      amount: t.amount,

      type: t.type === "EXPENSE" ? "expense" : "income",
    }));

    res.json(result);
  } catch (error) {
    console.error("Recent transactions error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getTopDoctors = async (req, res) => {
  try {
    const doctors = await prisma.user.findMany({
      where: {
        role: "DOCTOR",
        isActive: true,
      },

      select: {
        id: true,
        name: true,
        appointments: {
          where: {
            status: "COMPLETED",
          },
          select: { id: true },
        },
      },
    });

    const result = doctors
      .map((d) => ({
        id: d.id,
        name: d.name,
        appointments: d.appointments.length,
      }))
      .sort((a, b) => b.appointments - a.appointments)
      .slice(0, 5);

    res.json(result);
  } catch (error) {
    console.error("Top doctors error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getTopPatients = async (req, res) => {
  try {
    const patients = await prisma.patient.findMany({
      select: {
        id: true,
        name: true,

        appointments: {
          select: { id: true },
        },

        transactions: {
          where: {
            type: { in: ["APPOINTMENT", "PACKAGE"] },
          },
          select: { amount: true },
        },
      },
    });

    const result = patients
      .map((p) => {
        const paid = p.transactions.reduce(
          (sum, t) => sum + (t.amount || 0),
          0,
        );

        return {
          id: p.id,
          name: p.name,
          paid,
          appointments: p.appointments.length,
        };
      })
      .sort((a, b) => b.paid - a.paid)
      .slice(0, 5);

    res.json(result);
  } catch (error) {
    console.error("Top patients error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
