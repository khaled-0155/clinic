const router = require("express").Router();
const authMiddleware = require("../../middleware/auth.middleware");
const {
  login,
  forgotPassword,
  resetPassword,
  getMe,
  acceptInvite,
} = require("./auth.controller");

router.post("/login", login);
router.post("/request-reset", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/accept-invite", acceptInvite);
router.get("/me", authMiddleware, getMe);

module.exports = router;
