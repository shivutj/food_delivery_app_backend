// routes/restaurants.js - WITH DATA ISOLATION
const express = require("express");
const router = express.Router();
const Restaurant = require("../models/Restaurant");
const Menu = require("../models/Menu");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// Get all restaurants (public)
router.get("/", async (req, res) => {
  try {
    const restaurants = await Restaurant.find();
    res.json(restaurants);
  } catch (error) {
    logError("Get restaurants", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get menu for a restaurant (public)
router.get("/:id/menu", async (req, res) => {
  try {
    const menu = await Menu.find({ restaurant_id: req.params.id });
    res.json(menu);
  } catch (error) {
    logError("Get menu", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Get restaurant owner's own restaurant
router.get("/my-restaurant", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const restaurant = await Restaurant.findOne({ ownerId: req.user.userId });

    if (!restaurant) {
      return res
        .status(404)
        .json({ message: "No restaurant found. Please create one." });
    }

    res.json(restaurant);
  } catch (error) {
    logError("Get my restaurant", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Create restaurant (admin only, tied to owner)
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if owner already has a restaurant
    const existing = await Restaurant.findOne({ ownerId: req.user.userId });
    if (existing) {
      return res.status(400).json({ message: "You already have a restaurant" });
    }

    const { name, image, video, location } = req.body;

    const restaurant = new Restaurant({
      name,
      image,
      video,
      location,
      ownerId: req.user.userId, // ✅ Tie to owner
    });

    await restaurant.save();
    res.status(201).json(restaurant);
  } catch (error) {
    logError("Create restaurant", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Add menu item (admin only, to THEIR restaurant)
router.post("/:id/menu", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    // ✅ Verify owner owns this restaurant
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant || restaurant.ownerId.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "You can only add items to your own restaurant" });
    }

    const { name, price, category, image, description, available } = req.body;

    const menuItem = new Menu({
      restaurant_id: req.params.id,
      name,
      price,
      category: category || "Main Course",
      image: image || "https://via.placeholder.com/150",
      description,
      available: available !== undefined ? available : true,
    });

    await menuItem.save();
    res.status(201).json({ message: "Menu item added", item: menuItem });
  } catch (error) {
    logError("Add menu item", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Delete menu item (admin only, from THEIR restaurant)
router.delete("/menu/:menuId", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const menuItem = await Menu.findById(req.params.menuId).populate(
      "restaurant_id",
    );

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    // ✅ Verify owner owns this menu item's restaurant
    if (menuItem.restaurant_id.ownerId.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({
          message: "You can only delete items from your own restaurant",
        });
    }

    await Menu.findByIdAndDelete(req.params.menuId);
    res.json({ message: "Menu item deleted" });
  } catch (error) {
    logError("Delete menu item", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
