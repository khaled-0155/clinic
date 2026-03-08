const router = require("express").Router();
const roleMiddleware = require("../../middleware/role.middleware");

const {
  createPackage,
  getPackages,
  getPackageById,
  updatePackage,
  deletePackage,
  getPackagePatients,
  assignPatientToPackage,
  removePatientFromPackage,
} = require("./packages.controller");

router.post("/", roleMiddleware("ADMIN"), createPackage);
router.put("/:id", roleMiddleware("ADMIN"), updatePackage);

router.get("/", getPackages);
router.get("/:id/patients", getPackagePatients);
router.post("/:id/assign-patient", assignPatientToPackage);
router.get("/:id", getPackageById);

router.delete("/patient-package/:id", removePatientFromPackage);
router.delete("/:id", roleMiddleware("ADMIN"), deletePackage);

module.exports = router;
