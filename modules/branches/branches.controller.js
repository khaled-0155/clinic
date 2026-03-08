const prisma = require("../../config/prisma");

/*
CREATE BRANCH
Admin only
*/
const createBranch = async (req, res) => {
  try {
    const { name, address } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Branch name is required" });
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        address,
      },
    });

    console.log("🏢 Branch created:", branch.id);

    res.status(201).json(branch);
  } catch (error) {
    console.error("Create branch error:", error);
    console.error("🔥 LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/*
GET ALL BRANCHES
*/
const getBranches = async (req, res) => {
  try {
    const user = req.user;

    let where = {};

    // STAFF → only their branch
    if (user.role === "STAFF") {
      where.id = user.branchId;
    }

    const branches = await prisma.branch.findMany({
      where,
      include: {
        staff: true,
      },
    });

    res.json(branches);
  } catch (error) {
    console.error("Get branches error:", error);
    console.error("🔥 LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address } = req.body;

    const branch = await prisma.branch.findUnique({
      where: { id },
    });

    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    const updated = await prisma.branch.update({
      where: { id },
      data: {
        name: name ?? branch.name,
        address: address ?? branch.address,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Update branch error:", error);
    console.error("🔥 LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;

    const staffCount = await prisma.user.count({
      where: { branchId: id },
    });

    const appointmentCount = await prisma.appointment.count({
      where: { branchId: id },
    });

    if (staffCount > 0 || appointmentCount > 0) {
      return res.status(400).json({
        message: "Cannot delete branch with related records",
      });
    }

    await prisma.branch.delete({
      where: { id },
    });

    res.json({ message: "Branch deleted successfully" });
  } catch (error) {
    console.error("Delete branch error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const assignStaffToBranch = async (req, res) => {
  try {
    const { branchId } = req.params;
    const { staffIds } = req.body;

    if (!Array.isArray(staffIds)) {
      return res.status(400).json({
        message: "staffIds must be an array",
      });
    }

    // 1️⃣ Check branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    // 2️⃣ Validate all staff users
    const staffUsers = await prisma.user.findMany({
      where: {
        id: { in: staffIds },
        role: "STAFF",
      },
    });

    if (staffUsers.length !== staffIds.length) {
      return res.status(400).json({
        message: "One or more users are invalid or not STAFF",
      });
    }

    // 🔥 TRANSACTION (important)
    await prisma.$transaction([
      // 3️⃣ Remove all current staff from this branch
      prisma.user.updateMany({
        where: {
          branchId: branchId,
          role: "STAFF",
        },
        data: {
          branchId: null,
        },
      }),

      // 4️⃣ Assign selected staff to this branch
      prisma.user.updateMany({
        where: {
          id: { in: staffIds },
        },
        data: {
          branchId: branchId,
        },
      }),
    ]);

    const updatedBranchStaff = await prisma.user.findMany({
      where: {
        branchId: branchId,
        role: "STAFF",
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    res.json({
      message: "Staff assigned successfully (override mode)",
      staff: updatedBranchStaff,
    });
  } catch (error) {
    console.error("Assign staff error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createBranch,
  getBranches,
  updateBranch,
  assignStaffToBranch,
  deleteBranch,
};
