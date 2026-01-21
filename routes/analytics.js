// routes/analytics.js - FIXED ANALYTICS WITH ACCURATE DATA
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Menu = require("../models/Menu");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// ✅ REMOVED CACHING - Always fetch fresh data
router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const { timeRange = "today" } = req.query;
    const userRole = req.user.role;
    const userId = req.user.userId;

    console.log(`\n📊 ANALYTICS REQUEST`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Role: ${userRole}`);
    console.log(`   Time Range: ${timeRange}`);

    if (userRole === "customer") {
      return res.status(403).json({
        message:
          "Access denied. Analytics is for restaurant owners and admins only.",
      });
    }

    // Calculate date range
    const now = new Date();
    let startDate;

    if (timeRange === "today") {
      startDate = new Date(now.setHours(0, 0, 0, 0));
    } else if (timeRange === "last7days") {
      startDate = new Date(now.setDate(now.getDate() - 7));
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    console.log(`   Start Date: ${startDate.toISOString()}`);

    const orderQuery = {
      createdAt: { $gte: startDate },
    };

    let orders;
    let restaurantName = null;
    let scope = "all";

    // ✅ ROLE-BASED DATA FILTERING
    if (userRole === "admin") {
      console.log(`   ✅ Admin - fetching all orders`);
      orders = await Order.find(orderQuery).lean();
      scope = "all";
      console.log(`   Total orders found: ${orders.length}`);
    } else if (userRole === "restaurant") {
      // ✅ FIND RESTAURANT FIRST
      const restaurant = await Restaurant.findOne({ ownerId: userId });

      if (!restaurant) {
        console.log(`   ❌ No restaurant found for owner`);
        return res.json({
          metrics: {
            totalOrders: 0,
            totalRevenue: "0.00",
            activeUsers: 0,
          },
          ordersByStatus: {},
          chartData: [],
          timeRange,
          scope: "restaurant",
          restaurantName: null,
        });
      }

      console.log(`   Restaurant: ${restaurant.name} (ID: ${restaurant._id})`);
      restaurantName = restaurant.name;
      scope = "restaurant";

      // ✅ GET ALL MENU ITEMS FOR THIS RESTAURANT
      const restaurantMenuIds = await Menu.find({
        restaurant_id: restaurant._id,
      }).distinct("_id");

      console.log(`   Menu items count: ${restaurantMenuIds.length}`);

      if (restaurantMenuIds.length === 0) {
        console.log(`   ⚠️ No menu items - returning empty analytics`);
        return res.json({
          metrics: {
            totalOrders: 0,
            totalRevenue: "0.00",
            activeUsers: 0,
          },
          ordersByStatus: {},
          chartData: [],
          timeRange,
          scope: "restaurant",
          restaurantName: restaurant.name,
        });
      }

      // ✅ FETCH ALL ORDERS IN DATE RANGE
      const allOrders = await Order.find(orderQuery).lean();
      console.log(`   Total orders in date range: ${allOrders.length}`);

      // ✅ FILTER ORDERS THAT CONTAIN THIS RESTAURANT'S ITEMS
      orders = allOrders.filter((order) => {
        const hasRestaurantItem = order.items.some((item) => {
          const itemMenuId = item.menu_id?.toString();
          return restaurantMenuIds.some(
            (menuId) => menuId.toString() === itemMenuId,
          );
        });
        return hasRestaurantItem;
      });

      console.log(`   Orders for this restaurant: ${orders.length}`);
    } else {
      return res
        .status(403)
        .json({ message: "Invalid role for analytics access" });
    }

    // ✅ CALCULATE METRICS
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);

    // ✅ GET UNIQUE USER IDS
    const uniqueUserIds = [...new Set(orders.map((o) => o.user_id.toString()))];

    // ✅ COUNT ACTUAL CUSTOMER USERS
    const activeUsersCount = await User.countDocuments({
      _id: { $in: uniqueUserIds },
      role: "customer",
    });

    console.log(`   Metrics:`);
    console.log(`   - Total Orders: ${totalOrders}`);
    console.log(`   - Total Revenue: ₹${totalRevenue}`);
    console.log(`   - Active Users: ${activeUsersCount}`);

    // ✅ ORDERS BY STATUS
    const ordersByStatus = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    console.log(`   Orders by status:`, ordersByStatus);

    // ✅ ORDERS OVER TIME
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

    console.log(`   Chart data points: ${chartData.length}`);

    const response = {
      metrics: {
        totalOrders,
        totalRevenue: totalRevenue.toFixed(2),
        activeUsers: activeUsersCount,
      },
      ordersByStatus,
      chartData,
      timeRange,
      scope,
      restaurantName,
    };

    console.log(`   ✅ Analytics response prepared\n`);
    res.json(response);
  } catch (error) {
    console.error(`   ❌ Analytics error:`, error);
    logError("Get analytics", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ RESTAURANT PERFORMANCE (Admin only)
router.get("/restaurants", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    console.log(`\n📊 RESTAURANT PERFORMANCE REQUEST`);

    const restaurants = await Restaurant.find().lean();
    const allOrders = await Order.find().lean();

    console.log(`   Total Restaurants: ${restaurants.length}`);
    console.log(`   Total Orders: ${allOrders.length}`);

    const restaurantStats = await Promise.all(
      restaurants.map(async (restaurant) => {
        // Get menu IDs for this restaurant
        const menuIds = await Menu.find({
          restaurant_id: restaurant._id,
        }).distinct("_id");

        // Filter orders containing this restaurant's items
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

        console.log(
          `   ${restaurant.name}: ${restaurantOrders.length} orders, ₹${revenue}`,
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

    const sorted = restaurantStats.sort(
      (a, b) => b.totalRevenue - a.totalRevenue,
    );
    console.log(`   ✅ Restaurant performance calculated\n`);

    res.json(sorted);
  } catch (error) {
    console.error(`   ❌ Restaurant performance error:`, error);
    logError("Get restaurant performance", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
