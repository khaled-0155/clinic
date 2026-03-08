// patients.routes.js
const router = require("express").Router();
const auth = require("../../middleware/auth.middleware");

const {
  createPatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  addPatientNote,
  getPatientNotes,
  deletePatientNote,
  getPatientSessions,
  getPatientAppointments,
  getPatientPackages,
} = require("./patients.controller");

router.use(auth);

router.post("/", createPatient);
router.get("/", getPatients);
router.get("/:id", getPatientById);
router.put("/:id", updatePatient);
router.delete("/:id", deletePatient);

router.post("/:id/notes", addPatientNote);
router.get("/:id/notes", getPatientNotes);
router.delete("/:id/notes/:noteId", deletePatientNote);

router.get("/:id/appointments", getPatientAppointments);
router.get("/:id/sessions", getPatientSessions);
router.get("/:id/packages", getPatientPackages);

module.exports = router;
