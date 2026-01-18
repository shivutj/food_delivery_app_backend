// routes/orders.js - WITH STATUS FLOW ENFORCEMENT
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// ✅ Status flow validation
const STATUS_FLOW = {
  'Placed': ['Preparing'],
  'Preparing': ['Delivered'],
  'Delivered': [] // Final state
};

function isValidStatusTransition(currentStatus, newStatus) {
  if (currentStatus === newStatus) return false; // No change
  const allowedNext = STATUS_FLOW[currentStatus];
  return allowedNext && allowedNext.includes(newStatus);
}

// Place order (JWT protected)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { items, total } = req.body;

    const order = new Order({
      user_id: req.user.userId,
      items,
      total,
      status: "Placed",
    });
    await order.save();

    // Mock payment
    const payment = new Payment({
      order_id: order._id,
      transaction_id: "TXN" + Date.now(),
      amount: total,
    });
    await payment.save();

    res.status(201).json({ message: "Order placed successfully", order });
  } catch (error) {
    logError('Place order', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get order history for logged-in user
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.user.userId }).sort({
      createdAt: -1,
    });
    res.json(orders);
  } catch (error) {
    logError('Get order history', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all orders (Admin only)
router.get("/all", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    logError('Get all orders', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Update order status with flow enforcement
router.patch("/:id/status", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // ✅ Validate status transition
    if (!isValidStatusTransition(order.status, status)) {
      return res.status(400).json({ 
        message: `Cannot change status from ${order.status} to ${status}. Valid transitions: ${STATUS_FLOW[order.status]?.join(', ') || 'none'}` 
      });
    }

    order.status = status;
    await order.save();

    res.json({ message: "Order status updated", order });
  } catch (error) {
    logError('Update order status', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Get valid next statuses for an order
router.get("/:id/next-statuses", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const validNextStatuses = STATUS_FLOW[order.status] || [];
    
    res.json({ 
      currentStatus: order.status,
      validNextStatuses 
    });
  } catch (error) {
    logError('Get next statuses', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;