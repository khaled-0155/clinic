const router = require("express").Router();
const auth = require("../../middleware/auth.middleware");

const {
  // Appointment
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
} = require("./appointments.controller");

router.use(auth);

/* ================================
   📅 APPOINTMENTS
================================ */
router.get("/", getAppointments);
router.get("/:id", getAppointmentById);

router.get("/slots", getSlots);
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
