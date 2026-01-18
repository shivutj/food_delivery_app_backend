// routes/analytics.js - OPTIMIZED VERSION
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// Enhanced cache with TTL tracking
const analyticsCache = new Map();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Helper: Get from cache or compute
async function getCachedOrCompute(cacheKey, computeFn) {
  const cached = analyticsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const data = await computeFn();
  analyticsCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });

  return data;
}

// ✅ Get analytics (Admin or Restaurant owner)
router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const { timeRange = "today" } = req.query;
    const isAdmin = req.user.role === "admin";
    const cacheKey = `${req.user.userId}_${timeRange}`;

    const analytics = await getCachedOrCompute(cacheKey, async () => {
      const now = new Date();
      let startDate;

      if (timeRange === "today") {
        startDate = new Date(now.setHours(0, 0, 0, 0));
      } else if (timeRange === "last7days") {
        startDate = new Date(now.setDate(now.getDate() - 7));
      } else {
        startDate = new Date(now.setHours(0, 0, 0, 0));
      }

      const orderQuery = {
        createdAt: { $gte: startDate },
      };

      let orders;
      let restaurantName = null;

      if (!isAdmin) {
        const restaurant = await Restaurant.findOne({
          ownerId: req.user.userId,
        });

        if (!restaurant) {
          return res.status(404).json({ message: "No restaurant found" });
        }

        restaurantName = restaurant.name;

        const Menu = require("../models/Menu");
        const restaurantMenuIds = await Menu.find({
          restaurant_id: restaurant._id,
        }).distinct("_id");

        const allOrders = await Order.find(orderQuery).lean();
        orders = allOrders.filter((order) =>
          order.items.some((item) =>
            restaurantMenuIds.some(
              (menuId) => menuId.toString() === item.menu_id?.toString(),
            ),
          ),
        );
      } else {
        orders = await Order.find(orderQuery).lean();
      }

      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
      const activeUsers = [...new Set(orders.map((o) => o.user_id.toString()))]
        .length;

      const ordersByStatus = orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});

      const ordersOverTime = orders.reduce((acc, order) => {
        const date = order.createdAt.toISOString().split("T")[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      const chartData = Object.keys(ordersOverTime)
        .sort()
        .map((date) => ({
          date,
          orders: ordersOverTime[date],
        }));

      return {
        metrics: {
          totalOrders,
          totalRevenue: totalRevenue.toFixed(2),
          activeUsers,
        },
        ordersByStatus,
        chartData,
        timeRange,
        restaurantName,
      };
    });

    res.json(analytics);
  } catch (error) {
    logError("Get analytics", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Get restaurant performance (Admin only)
router.get("/restaurants", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const cacheKey = "restaurant_performance";

    const data = await getCachedOrCompute(cacheKey, async () => {
      const restaurants = await Restaurant.find().lean();
      const Menu = require("../models/Menu");
      const allOrders = await Order.find().lean();

      const restaurantStats = await Promise.all(
        restaurants.map(async (restaurant) => {
          const menuIds = await Menu.find({
            restaurant_id: restaurant._id,
          }).distinct("_id");

          const restaurantOrders = allOrders.filter((order) =>
            order.items.some((item) =>
              menuIds.some(
                (menuId) => menuId.toString() === item.menu_id?.toString(),
              ),
            ),
          );

          const revenue = restaurantOrders.reduce(
            (sum, order) => sum + order.total,
            0,
          );

          return {
            id: restaurant._id,
            name: restaurant.name,
            totalOrders: restaurantOrders.length,
            totalRevenue: revenue.toFixed(2),
            rating: restaurant.rating,
          };
        }),
      );

      return restaurantStats.sort((a, b) => b.totalRevenue - a.totalRevenue);
    });

    res.json(data);
  } catch (error) {
    logError("Get restaurant performance", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Clear cache (Admin only)
router.post("/clear-cache", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    analyticsCache.clear();
    res.json({ message: "Cache cleared successfully" });
  } catch (error) {
    logError("Clear cache", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
