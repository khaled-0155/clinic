const express = require("express");
const router = express.Router();

const controller = require("./transactions.controller");
/**
 * GET ALL
 */
router.get("/", controller.getTransactions);

/**
 * GET BY ID
 */
router.get("/:id", controller.getTransactionById);

/**
 * ADD EXPENSE
 */
router.post("/", controller.addExpense);

module.exports = router;
