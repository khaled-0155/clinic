// routes/scheduleRoutes.js
const express = require("express");
const router = express.Router();
const controller = require("./scheduleController");

// Schedules
router.post("/", controller.createSchedule); // create
router.put("/:id", controller.updateSchedule); // update
router.delete("/:id", controller.deleteSchedule); // delete
router.get("/", controller.listSchedulesForDoctor); // list by doctorId/branchId query params

// Exceptions
router.post("/exceptions", controller.createException);
router.put("/exceptions/:id", controller.updateException);
router.delete("/exceptions/:id", controller.deleteException);

// Slots
// GET /api/schedules/slots?doctorId=...&branchId=...&date=YYYY-MM-DD&slotLength=30
router.get("/slots", controller.getSlots);

module.exports = router;
