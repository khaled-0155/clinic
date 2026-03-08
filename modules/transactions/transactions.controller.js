const prisma = require("../../config/prisma");

/**
 * GET ALL TRANSACTIONS
 * with pagination + filters
 */
exports.getTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      branchId,
      patientId,
      startDate,
      endDate,
    } = req.query;

    const skip = (page - 1) * limit;

    const where = {};

    if (type) where.type = type;
    if (branchId) where.branchId = branchId;
    if (patientId) where.patientId = patientId;

    if (startDate || endDate) {
      where.createdAt = {};

      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip: Number(skip),
        take: Number(limit),
        orderBy: { createdAt: "desc" },

        include: {
          patient: true,
          branch: true,

          appointment: {
            include: {
              doctor: {
                select: { id: true, name: true },
              },
              patient: {
                select: { id: true, name: true },
              },
            },
          },

          createdBy: {
            select: { id: true, name: true },
          },
        },
      }),

      prisma.transaction.count({ where }),
    ]);

    res.json({
      data: transactions,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
};

/**
 * GET TRANSACTION BY ID
 */
exports.getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await prisma.transaction.findUnique({
      where: { id },

      include: {
        patient: true,
        branch: true,

        appointment: {
          include: {
            doctor: true,
            patient: true,
          },
        },

        createdBy: true,
      },
    });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch transaction" });
  }
};

/**
 * ADD EXPENSE
 */
exports.addExpense = async (req, res) => {
  try {
    const { amount, notes } = req.body;

    if (!amount) {
      return res.status(400).json({
        message: "amount is required",
      });
    }

    const transaction = await prisma.transaction.create({
      data: {
        type: "EXPENSE",
        amount: Number(amount),
        notes,
        createdById: req.user.id, // from auth middleware
      },
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create expense" });
  }
};
