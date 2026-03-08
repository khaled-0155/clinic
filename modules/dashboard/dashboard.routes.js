const router = require("express").Router();
const roleMiddleware = require("../../middleware/role.middleware");
const {
  getStats,
  getAppointmentStatistics,
  getAppointmentsWidget,
  getRecentTransactions,
  getTopDoctors,
  getTopPatients,
} = require("./dashboard.controller");

// Admin only
router.get("/stats", roleMiddleware("ADMIN", "STAFF"), getStats);
router.get("/appointments/statistics", getAppointmentStatistics);
router.get("/appointments/widget", getAppointmentsWidget);
router.get("/recent-transactions", getRecentTransactions);
router.get("/top-doctors", getTopDoctors);
router.get("/top-patients", getTopPatients);

module.exports = router;
