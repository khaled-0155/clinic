const express = require("express");
const router = express.Router();

const controller = require("./medicalRecord.controller");

// create record
router.post("/", controller.createMedicalRecord);

// patient records
router.get("/patient/:patientId", controller.getPatientMedicalRecords);

// single record
router.get("/:id", controller.getMedicalRecord);

// update
router.put("/:id", controller.updateMedicalRecord);

// delete
router.delete("/:id", controller.deleteMedicalRecord);

module.exports = router;
