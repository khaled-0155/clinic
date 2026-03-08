const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./modules/auth/auth.routes"));

app.use(require("./middleware/auth.middleware"));

app.use("/api/users", require("./modules/users/users.routes"));
app.use("/api/branches", require("./modules/branches/branches.routes"));
app.use("/api/schedules", require("./modules/schedule/schedule.routes"));

app.use(
  "/api/appointments",
  require("./modules/appointments/appointments.routes"),
);
app.use("/api/patients", require("./modules/patients/patients.routes"));
app.get("/health", (req, res) => {
  res.json({ message: "Clinic API running 🚀" });
});
app.use("/api/packages", require("./modules/packages/packages.routes"));
app.use(
  "/api/patient-packages",
  require("./modules/patientPackages/patientPackages.routes"),
);
app.use(
  "/api/transactions",
  require("./modules/transactions/transactions.routes"),
);
app.use("/api/dashboard", require("./modules/dashboard/dashboard.routes"));

module.exports = app;
