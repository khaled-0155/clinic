const router = require("express").Router();
const {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  acceptInvite,
  createUserWithPassword,
  toggleUserStatus,
  getUserById,
} = require("./users.controller");

const roleMiddleware = require("../../middleware/role.middleware");
const { sendEmail } = require("../../services/mail.service");

// Admin only routes
router.post("/invite", roleMiddleware("ADMIN"), createUser);
router.post("/direct", roleMiddleware("ADMIN"), createUserWithPassword);
router.get("/", getUsers);
router.get("/:id", getUserById);
router.put("/:id", roleMiddleware("ADMIN"), updateUser);
router.patch("/:id/toggle-status", roleMiddleware("ADMIN"), toggleUserStatus);
router.delete("/:id", roleMiddleware("ADMIN"), deleteUser);

/***************************** */
router.get("/test-email", async (req, res) => {
  try {
    await sendEmail(
      "khaledhany840@gmail.com",
      "Brevo Test Email 🚀",
      "<h1>Brevo is working correctly!</h1>",
    );

    res.json({ success: true, message: "Email sent!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});
module.exports = router;
