// routes/restaurants.js - COMPLETE FIXED VERSION
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
    // ✅ FIXED: Allow both 'restaurant' and 'admin' roles
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      console.log(`❌ Access denied for role: ${req.user.role}`);
      return res.status(403).json({ message: "Access denied" });
    }

    const restaurant = await Restaurant.findOne({ ownerId: req.user.userId });

    if (!restaurant) {
      console.log(`ℹ️ No restaurant found for user: ${req.user.userId}`);
      return res
        .status(404)
        .json({ message: "No restaurant found. Please create one." });
    }

    console.log(`✅ Found restaurant: ${restaurant.name}`);
    res.json(restaurant);
  } catch (error) {
    logError("Get my restaurant", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ FIXED: Create restaurant - Accept both 'restaurant' and 'admin' roles
router.post("/", authMiddleware, async (req, res) => {
  try {
    console.log(`\n📝 CREATE RESTAURANT REQUEST`);
    console.log(`   User ID: ${req.user.userId}`);
    console.log(`   User Role: ${req.user.role}`);
    console.log(`   Data:`, req.body);

    // ✅ FIXED: Accept both roles
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      console.log(`❌ Access denied for role: ${req.user.role}`);
      return res.status(403).json({
        message:
          "Access denied. Only restaurant owners can create restaurants.",
      });
    }

    // Check if owner already has a restaurant
    const existing = await Restaurant.findOne({ ownerId: req.user.userId });
    if (existing) {
      console.log(`❌ User already has restaurant: ${existing.name}`);
      return res.status(400).json({ message: "You already have a restaurant" });
    }

    const {
      name,
      image,
      images,
      video,
      location,
      description,
      phone,
      cuisine,
    } = req.body;

    // ✅ Validate required fields
    if (!name || !name.trim()) {
      console.log(`❌ Missing restaurant name`);
      return res.status(400).json({ message: "Restaurant name is required" });
    }

    // ✅ Handle images array (up to 5 images)
    let imageArray = [];
    let primaryImage = image;

    if (images && Array.isArray(images) && images.length > 0) {
      // Limit to 5 images
      imageArray = images.slice(0, 5);
      // Use first image as primary if no primary specified
      if (!primaryImage) {
        primaryImage = imageArray[0];
      }
    } else if (image) {
      // If only single image provided, add to array
      imageArray = [image];
      primaryImage = image;
    }

    if (!primaryImage) {
      console.log(`❌ At least one image is required`);
      return res
        .status(400)
        .json({ message: "At least one restaurant image is required" });
    }

    console.log(
      `📸 Images: ${imageArray.length} images, Primary: ${primaryImage}`,
    );

    // ✅ Create restaurant with all optional fields
    const restaurantData = {
      name: name.trim(),
      image: primaryImage.trim(), // Primary image for backward compatibility
      images: imageArray, // ✅ Gallery array
      ownerId: req.user.userId,
      rating: 4.0, // Default rating
    };

    if (video && video.trim()) {
      restaurantData.video = video.trim();
    }

    if (location) {
      restaurantData.location = location;
    }

    if (description && description.trim()) {
      restaurantData.description = description.trim();
    }

    if (phone && phone.trim()) {
      restaurantData.phone = phone.trim();
    }

    if (cuisine && cuisine.trim()) {
      restaurantData.cuisine = cuisine.trim();
    }

    console.log(`📦 Creating restaurant with data:`, restaurantData);

    const restaurant = new Restaurant(restaurantData);
    await restaurant.save();

    console.log(
      `✅ Restaurant created successfully: ${restaurant.name} (ID: ${restaurant._id})`,
    );
    res.status(201).json(restaurant);
  } catch (error) {
    console.error(`❌ Restaurant creation error:`, error);
    logError("Create restaurant", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ FIXED: Update restaurant
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    console.log(`\n✏️ UPDATE RESTAURANT REQUEST`);
    console.log(`   Restaurant ID: ${req.params.id}`);
    console.log(`   User ID: ${req.user.userId}`);
    console.log(`   User Role: ${req.user.role}`);

    // ✅ FIXED: Accept both roles
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      console.log(`❌ Restaurant not found: ${req.params.id}`);
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // ✅ Verify ownership
    if (restaurant.ownerId.toString() !== req.user.userId) {
      console.log(
        `❌ Ownership mismatch. Owner: ${restaurant.ownerId}, User: ${req.user.userId}`,
      );
      return res
        .status(403)
        .json({ message: "You can only update your own restaurant" });
    }

    const {
      name,
      image,
      images,
      video,
      location,
      description,
      phone,
      cuisine,
    } = req.body;

    // ✅ Update only provided fields
    if (name && name.trim()) restaurant.name = name.trim();

    // ✅ Handle images array update (limit to 5)
    if (images && Array.isArray(images) && images.length > 0) {
      restaurant.images = images.slice(0, 5);
      // Update primary image to first in array if not provided
      if (!image && images.length > 0) {
        restaurant.image = images[0];
      }
    }

    if (image && image.trim()) restaurant.image = image.trim();
    if (video !== undefined) restaurant.video = video?.trim() || undefined;
    if (location !== undefined) restaurant.location = location;
    if (description !== undefined)
      restaurant.description = description?.trim() || undefined;
    if (phone !== undefined) restaurant.phone = phone?.trim() || undefined;
    if (cuisine !== undefined)
      restaurant.cuisine = cuisine?.trim() || undefined;

    await restaurant.save();

    console.log(`✅ Restaurant updated: ${restaurant.name}`);
    res.json(restaurant);
  } catch (error) {
    console.error(`❌ Restaurant update error:`, error);
    logError("Update restaurant", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Add menu item (restaurant owner or admin)
router.post("/:id/menu", authMiddleware, async (req, res) => {
  try {
    // ✅ FIXED: Accept both roles
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    // ✅ Verify owner owns this restaurant
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    if (restaurant.ownerId.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "You can only add items to your own restaurant" });
    }

    const {
      name,
      price,
      category,
      image,
      description,
      available,
      isVeg,
      video,
    } = req.body;

    const menuItem = new Menu({
      restaurant_id: req.params.id,
      name,
      price,
      category: category || "Main Course",
      image: image || "https://via.placeholder.com/150",
      description,
      available: available !== undefined ? available : true,
      isVeg: isVeg !== undefined ? isVeg : true,
      video,
    });

    await menuItem.save();
    res.status(201).json({ message: "Menu item added", item: menuItem });
  } catch (error) {
    logError("Add menu item", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Delete menu item (restaurant owner or admin)
router.delete("/menu/:menuId", authMiddleware, async (req, res) => {
  try {
    // ✅ FIXED: Accept both roles
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access required" });
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
