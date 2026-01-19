// routes/payments.js - NEW FILE
const express = require("express");
const router = express.Router();
const Payment = require("../models/Payment");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// Initiate payment
router.post("/initiate", authMiddleware, async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // Generate transaction ID
    const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

    // Create pending payment record
    const payment = new Payment({
      order_id: null, // Will be updated when order is created
      transaction_id: transactionId,
      amount,
      status: "Pending",
      paymentMethod: paymentMethod || "cod",
    });

    await payment.save();

    res.json({
      transactionId,
      amount,
      status: "Pending",
      message: "Payment initiated successfully",
    });
  } catch (error) {
    logError("Initiate payment", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Verify payment
router.get("/verify/:transactionId", authMiddleware, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      transaction_id: req.params.transactionId,
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json({
      transactionId: payment.transaction_id,
      status: payment.status,
      amount: payment.amount,
    });
  } catch (error) {
    logError("Verify payment", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Rollback payment
router.post("/rollback", authMiddleware, async (req, res) => {
  try {
    const { transactionId } = req.body;

    const payment = await Payment.findOne({
      transaction_id: transactionId,
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    payment.status = "Cancelled";
    await payment.save();

    res.json({ message: "Payment rolled back" });
  } catch (error) {
    logError("Rollback payment", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get payment history for user
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate({
        path: "order_id",
        match: { user_id: req.user.userId },
      })
      .sort({ createdAt: -1 });

    const userPayments = payments.filter((p) => p.order_id !== null);

    res.json(userPayments);
  } catch (error) {
    logError("Get payment history", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;