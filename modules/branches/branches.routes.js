const router = require("express").Router();
const {
  createBranch,
  getBranches,
  updateBranch,
  deleteBranch,
  assignStaffToBranch,
} = require("./branches.controller");

const roleMiddleware = require("../../middleware/role.middleware");

// All routes require authentication

// Admin only
router.post("/", roleMiddleware("ADMIN"), createBranch);
router.put("/:id", roleMiddleware("ADMIN"), updateBranch);
router.delete("/:id", roleMiddleware("ADMIN"), deleteBranch);
router.patch(
  "/:branchId/assign-staff",
  roleMiddleware("ADMIN"),
  assignStaffToBranch,
);

// Authenticated users can view branches
router.get("/", getBranches);

module.exports = router;
