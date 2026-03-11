const router = require("express").Router();
const auth = require("../../middleware/auth.middleware");

const {
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
} = require("./appointments.controller");

router.use(auth);

/* ================================
   📅 APPOINTMENTS
================================ */
router.get("/", getAppointments);
router.get("/slots", getSlots);
router.get("/:id", getAppointmentById);
router.delete("/:id", deleteAppointment);

// Create appointment
router.post("/", createAppointment);
// Complete appointment
router.put("/:id/complete", completeAppointment);
// Cancel appointment
router.put("/:id/cancel", cancelAppointment);
router.put("/:id/status", updateAppointmentStatus);

router.post("/:id/progress", addAppointmentProgress);
router.patch("/:id/progress", updateAppointmentProgress);
router.get("/:id/progress", getAppointmentProgress);

module.exports = router;
