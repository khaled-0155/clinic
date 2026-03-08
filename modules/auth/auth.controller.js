const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");
const generateToken = require("../../utils/generateToken");
const { sendResetPasswordEmail } = require("../../services/mail.service");
const crypto = require("crypto");

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        password: true,
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account not activated" });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error("🔥 LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Security: always return success
    if (!user) {
      return res.json({ message: "If email exists, reset link sent" });
    }

    /* =========================
       GENERATE TOKEN
    ========================= */

    const resetToken = crypto.randomBytes(32).toString("hex");

    // 1 hour expiry
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

    /* =========================
       SAVE TOKEN
    ========================= */

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetExpires: resetExpiry,
      },
      select: {
        id: true,
        email: true,
        resetToken: true,
        resetExpires: true,
      },
    });

    /* =========================
       SEND EMAIL
    ========================= */

    await sendResetPasswordEmail({
      toEmail: user.email,
      toName: user.name,
      resetToken,
    });

    res.json({ message: "If email exists, reset link sent" });
  } catch (error) {
    console.error("🔥 Forgot Password Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const user = await prisma.user.findFirst({
      where: { resetToken: token },
      select: {
        id: true,
        password: true,
        resetExpires: true,
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid token" });
    }

    if (!user.resetExpires || user.resetExpires < new Date()) {
      return res.status(400).json({ message: "Token expired" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetExpires: null,
      },
    });

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("🔥 RESET PASSWORD ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getMe = async (req, res) => {
  try {
    const user = req.user;

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("🔥 GET ME ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const acceptInvite = async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { inviteToken: token },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid token" });
    }

    if (user.inviteExpires < new Date()) {
      return res.status(400).json({ message: "Invite expired" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        isActive: true,
        inviteToken: null,
        inviteExpires: null,
      },
    });

    res.json({ message: "Account activated successfully" });
  } catch (error) {
    console.error("🔥 LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};
module.exports = { acceptInvite, login, forgotPassword, resetPassword, getMe };
