// routes/orders.js - WITH DELIVERY NOTIFICATION
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Restaurant = require("../models/Restaurant");
const Menu = require("../models/Menu");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// Status flow validation
const STATUS_FLOW = {
  Placed: ["Preparing"],
  Preparing: ["Delivered"],
  Delivered: [],
};

function isValidStatusTransition(currentStatus, newStatus) {
  if (currentStatus === newStatus) return false;
  const allowedNext = STATUS_FLOW[currentStatus];
  return allowedNext && allowedNext.includes(newStatus);
}

// Place order with payment integration
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { items, total, transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ message: "Transaction ID is required" });
    }

    const payment = await Payment.findOne({ transaction_id: transactionId });

    if (!payment) {
      return res.status(400).json({ message: "Invalid transaction" });
    }

    if (payment.status !== "Pending") {
      return res.status(400).json({ message: "Payment already processed" });
    }

    const order = new Order({
      user_id: req.user.userId,
      items,
      total,
      status: "Placed",
    });
    await order.save();

    payment.order_id = order._id;
    payment.status = "Success";
    await payment.save();

    console.log(`✅ Order ${order._id} placed with payment ${transactionId}`);

    res.status(201).json({
      message: "Order placed successfully",
      order,
      payment: {
        transactionId: payment.transaction_id,
        status: payment.status,
      },
    });
  } catch (error) {
    logError("Place order", error);
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
    logError("Get order history", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get orders filtered by role
router.get("/all", authMiddleware, async (req, res) => {
  try {
    console.log(`\n📋 GET ALL ORDERS REQUEST`);
    console.log(`   User ID: ${req.user.userId}`);
    console.log(`   User Role: ${req.user.role}`);

    if (req.user.role === "admin") {
      console.log(`   ✅ Admin access - returning all orders`);
      const orders = await Order.find().sort({ createdAt: -1 });
      console.log(`   Found ${orders.length} total orders`);
      return res.json(orders);
    }

    if (req.user.role === "restaurant") {
      console.log(`   🍽️ Restaurant owner access - filtering orders`);

      const restaurant = await Restaurant.findOne({ ownerId: req.user.userId });

      if (!restaurant) {
        console.log(`   ❌ No restaurant found for user`);
        return res.json([]);
      }

      console.log(`   Restaurant: ${restaurant.name} (ID: ${restaurant._id})`);

      const restaurantMenuIds = await Menu.find({
        restaurant_id: restaurant._id,
      }).distinct("_id");

      console.log(`   Menu items count: ${restaurantMenuIds.length}`);

      if (restaurantMenuIds.length === 0) {
        console.log(`   ⚠️ No menu items found - no orders to show`);
        return res.json([]);
      }

      const allOrders = await Order.find().sort({ createdAt: -1 }).lean();
      console.log(`   Total orders in database: ${allOrders.length}`);

      const restaurantOrders = allOrders.filter((order) => {
        const hasRestaurantItem = order.items.some((item) =>
          restaurantMenuIds.some(
            (menuId) => menuId.toString() === item.menu_id?.toString(),
          ),
        );
        return hasRestaurantItem;
      });

      console.log(
        `   ✅ Filtered orders for restaurant: ${restaurantOrders.length}`,
      );
      return res.json(restaurantOrders);
    }

    console.log(`   ❌ Customer role - access denied`);
    return res.status(403).json({ message: "Access denied" });
  } catch (error) {
    console.error(`   ❌ Error in /orders/all:`, error);
    logError("Get all orders", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update order status - WITH DELIVERY NOTIFICATION
router.patch("/:id/status", authMiddleware, async (req, res) => {
  try {
    console.log(`\n🔄 UPDATE ORDER STATUS REQUEST`);
    console.log(`   Order ID: ${req.params.id}`);
    console.log(`   User Role: ${req.user.role}`);
    console.log(`   New Status: ${req.body.status}`);

    if (req.user.role !== "admin" && req.user.role !== "restaurant") {
      console.log(`   ❌ Access denied for role: ${req.user.role}`);
      return res
        .status(403)
        .json({ message: "Admin or restaurant owner access required" });
    }

    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      console.log(`   ❌ Order not found`);
      return res.status(404).json({ message: "Order not found" });
    }

    if (req.user.role === "restaurant") {
      const restaurant = await Restaurant.findOne({ ownerId: req.user.userId });

      if (!restaurant) {
        console.log(`   ❌ No restaurant found for user`);
        return res.status(403).json({ message: "No restaurant found" });
      }

      const restaurantMenuIds = await Menu.find({
        restaurant_id: restaurant._id,
      }).distinct("_id");

      const hasRestaurantItem = order.items.some((item) =>
        restaurantMenuIds.some(
          (menuId) => menuId.toString() === item.menu_id?.toString(),
        ),
      );

      if (!hasRestaurantItem) {
        console.log(`   ❌ Order does not contain items from this restaurant`);
        return res.status(403).json({
          message: "This order does not contain items from your restaurant",
        });
      }

      console.log(`   ✅ Restaurant owner verified for this order`);
    }

    if (!isValidStatusTransition(order.status, status)) {
      console.log(
        `   ❌ Invalid status transition: ${order.status} -> ${status}`,
      );
      return res.status(400).json({
        message: `Cannot change status from ${order.status} to ${status}. Valid transitions: ${STATUS_FLOW[order.status]?.join(", ") || "none"}`,
      });
    }

    const previousStatus = order.status;
    order.status = status;
    await order.save();

    console.log(`   ✅ Order status updated to: ${status}`);

    // ✅ SEND NOTIFICATION IF DELIVERED
    if (status === "Delivered" && previousStatus !== "Delivered") {
      console.log(
        `   📧 Order delivered - notification should be sent to customer`,
      );
      // The notification will be handled by the frontend when it receives this response
    }

    res.json({
      message: "Order status updated",
      order,
      // ✅ Include flag for frontend to show review popup
      showReviewPopup: status === "Delivered",
    });
  } catch (error) {
    console.error(`   ❌ Update order status error:`, error);
    logError("Update order status", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get valid next statuses
router.get("/:id/next-statuses", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const validNextStatuses = STATUS_FLOW[order.status] || [];

    res.json({
      currentStatus: order.status,
      validNextStatuses,
    });
  } catch (error) {
    logError("Get next statuses", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
