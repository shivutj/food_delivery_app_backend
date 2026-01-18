// routes/analytics.js - MVP Analytics Dashboard
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// Cache analytics for 15 minutes
let analyticsCache = {};
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// ✅ Get analytics (Admin sees all, Restaurant owner sees only their data)
router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { timeRange = 'today' } = req.query; // 'today' or 'last7days'
    const cacheKey = `${req.user.userId}_${timeRange}`;

    // Check cache
    if (analyticsCache[cacheKey] && Date.now() - analyticsCache[cacheKey].timestamp < CACHE_DURATION) {
      return res.json(analyticsCache[cacheKey].data);
    }

    // Calculate date range
    const now = new Date();
    let startDate;
    
    if (timeRange === 'today') {
      startDate = new Date(now.setHours(0, 0, 0, 0));
    } else if (timeRange === 'last7days') {
      startDate = new Date(now.setDate(now.getDate() - 7));
    } else {
      startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    // Get restaurant owner's restaurant
    const restaurant = await Restaurant.findOne({ ownerId: req.user.userId });
    
    if (!restaurant) {
      return res.status(404).json({ message: 'No restaurant found' });
    }

    // Build query - filter by restaurant's orders
    const orderQuery = {
      createdAt: { $gte: startDate }
    };

    // Get orders with restaurant's menu items
    const Menu = require("../models/Menu");
    const restaurantMenuIds = await Menu.find({ 
      restaurant_id: restaurant._id 
    }).distinct('_id');

    // Filter orders that contain at least one item from this restaurant
    const orders = await Order.find(orderQuery);
    const restaurantOrders = orders.filter(order => 
      order.items.some(item => 
        restaurantMenuIds.some(menuId => menuId.toString() === item.menu_id?.toString())
      )
    );

    // ✅ Calculate metrics
    const totalOrders = restaurantOrders.length;
    const totalRevenue = restaurantOrders.reduce((sum, order) => sum + order.total, 0);
    
    // Active users (customers who ordered from this restaurant)
    const activeUsers = [...new Set(restaurantOrders.map(o => o.user_id.toString()))].length;

    // Order status breakdown
    const ordersByStatus = restaurantOrders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    // Orders over time (for chart)
    const ordersOverTime = restaurantOrders.reduce((acc, order) => {
      const date = order.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    const chartData = Object.keys(ordersOverTime)
      .sort()
      .map(date => ({
        date,
        orders: ordersOverTime[date]
      }));

    const analytics = {
      metrics: {
        totalOrders,
        totalRevenue: totalRevenue.toFixed(2),
        activeUsers
      },
      ordersByStatus,
      chartData,
      timeRange,
      restaurantName: restaurant.name
    };

    // Cache results
    analyticsCache[cacheKey] = {
      data: analytics,
      timestamp: Date.now()
    };

    res.json(analytics);
  } catch (error) {
    logError('Get analytics', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Get system logs (Admin only)
router.get("/logs", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const SystemLog = require("../models/SystemLog");
    const logs = await SystemLog.find()
      .sort({ timestamp: -1 })
      .limit(100);

    res.json(logs);
  } catch (error) {
    logError('Get logs', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Mark log as resolved
router.patch("/logs/:id/resolve", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const SystemLog = require("../models/SystemLog");
    await SystemLog.findByIdAndUpdate(req.params.id, { resolved: true });

    res.json({ message: 'Log marked as resolved' });
  } catch (error) {
    logError('Resolve log', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;