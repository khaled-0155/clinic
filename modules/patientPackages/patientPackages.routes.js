const router = require("express").Router();
const roleMiddleware = require("../../middleware/role.middleware");

const {
  assignPackageToPatient,
  getPatientPackages,
  getAssignedPackage,
} = require("./patientPackages.controller");

router.post("/", roleMiddleware("ADMIN", "STAFF"), assignPackageToPatient);
router.get("/patient/:patientId", getPatientPackages);
router.get("/:id", getAssignedPackage);

module.exports = router;
