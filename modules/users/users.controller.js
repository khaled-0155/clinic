const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");
const { Role } = require("@prisma/client");
const { sendInviteEmail } = require("../../services/mail.service");
const crypto = require("crypto");

const getUsers = async (req, res) => {
  try {
    const user = req.user;

    const {
      page = 1,
      limit = 10,
      search,
      role,
      branchId,
      isActive,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    const filters = {};

    // 🔎 Search by name or email
    if (search) {
      filters.OR = [
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          email: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    // 🎭 Filter by role
    if (role) {
      filters.role = role;
    }

    // 🏢 Filter by branch
    if (branchId) {
      filters.branchId = branchId;
    }

    // 🔘 Filter by active status
    if (isActive !== undefined) {
      filters.isActive = isActive === "true";
    }

    /* 🔐 ROLE SCOPING */

    // Doctor → only himself
    if (user.role === "DOCTOR") {
      filters.id = user.id;
    }

    // 📊 Total count
    const total = await prisma.user.count({
      where: filters,
    });

    // 📦 Paginated data
    const users = await prisma.user.findMany({
      where: filters,
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder === "asc" ? "asc" : "desc",
      },
      skip,
      take: pageSize,
    });

    res.json({
      data: users,
      meta: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("🔥 GET USERS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        branch: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If not doctor → return basic info
    if (user.role !== "DOCTOR") {
      return res.json(user);
    }

    // 🔥 Efficient Doctor Statistics (DB Level)

    const [
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      upcomingAppointments,
      uniquePatients,
      totalSessions,
    ] = await Promise.all([
      prisma.appointment.count({
        where: { doctorId: id },
      }),

      prisma.appointment.count({
        where: { doctorId: id, status: "COMPLETED" },
      }),

      prisma.appointment.count({
        where: { doctorId: id, status: "CANCELLED" },
      }),

      prisma.appointment.count({
        where: { doctorId: id, status: "BOOKED" },
      }),

      prisma.appointment
        .findMany({
          where: { doctorId: id },
          select: { patientId: true },
          distinct: ["patientId"],
        })
        .then((r) => r.length),

      prisma.session.count({
        where: {
          appointment: {
            doctorId: id,
          },
        },
      }),
    ]);

    res.json({
      ...user,
      stats: {
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        upcomingAppointments,
        uniquePatients,
        totalSessions,
      },
    });
  } catch (error) {
    console.error("🔥 GET USER BY ID ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, branchId } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Determine final role (if changing role)
    const finalRole = role ?? user.role;

    // If final role is STAFF, branch is required
    if (finalRole === "STAFF" && !branchId) {
      return res.status(400).json({
        message: "Staff must belong to branch",
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: name ?? user.name,
        role: finalRole,
        branchId: finalRole === "STAFF" ? branchId : null,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        appointments: true,
        doctorSchedules: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.appointments.length > 0 || user.doctorSchedules.length > 0) {
      return res.status(400).json({
        message: "Cannot delete user with related records",
      });
    }

    await prisma.user.delete({
      where: { id },
    });

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("🔥 DELETE USER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        isActive: !user.isActive,
      },
    });

    res.json({
      message: `User ${updatedUser.isActive ? "activated" : "deactivated"} successfully`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("🔥 TOGGLE USER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, email, role, branchId } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!Object.values(Role).includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (role === "STAFF" && !branchId) {
      return res.status(400).json({ message: "Staff must belong to branch" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");

    await prisma.user.create({
      data: {
        name,
        email,
        role,
        branchId: role === "STAFF" ? branchId : null,
        inviteToken,
        inviteExpires: new Date(Date.now() + 1000 * 60 * 60 * 24),
        isActive: true,
      },
    });

    // 🔥 Send email
    await sendInviteEmail({
      toEmail: email,
      toName: name,
      inviteToken,
      role,
    });

    res.status(201).json({
      message: "User invited successfully",
    });
  } catch (error) {
    console.error(error);
    console.error("🔥 LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const createUserWithPassword = async (req, res) => {
  try {
    const { name, email, role, branchId, password } = req.body;

    if (!name || !role || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!Object.values(Role).includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (role === "STAFF" && !branchId) {
      return res.status(400).json({ message: "Staff must belong to branch" });
    }

    // Generate dummy email if not provided
    let finalEmail = email;

    if (!finalEmail) {
      let exists = true;

      while (exists) {
        const randomNumber = Math.floor(100 + Math.random() * 900);
        finalEmail = `${role.toLowerCase()}.${name}_${randomNumber}@clinic.online`;

        const existingUser = await prisma.user.findUnique({
          where: { email: finalEmail },
        });

        if (!existingUser) exists = false;
      }
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: finalEmail },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email: finalEmail,
        role,
        branchId: role === "STAFF" ? branchId : null,
        password: hashedPassword,
        isActive: true,
      },
    });

    res.status(201).json({
      message: "User created successfully",
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  createUserWithPassword,
  toggleUserStatus,
  getUserById,
};
