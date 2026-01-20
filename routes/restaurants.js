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

// Get restaurant owner's own restaurant
router.get("/my-restaurant", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
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

// CREATE restaurant
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({
        message:
          "Access denied. Only restaurant owners can create restaurants.",
      });
    }

    const existing = await Restaurant.findOne({ ownerId: req.user.userId });
    if (existing) {
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
      dineInAvailable, // ✅ NEW
      operatingHours, // ✅ NEW
      bookingPhone, // ✅ NEW
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Restaurant name is required" });
    }

    let imageArray = [];
    let primaryImage = image;

    if (images && Array.isArray(images) && images.length > 0) {
      imageArray = images.slice(0, 5);
      if (!primaryImage) primaryImage = imageArray[0];
    } else if (image) {
      imageArray = [image];
      primaryImage = image;
    }

    if (!primaryImage) {
      return res
        .status(400)
        .json({ message: "At least one restaurant image is required" });
    }

    const restaurantData = {
      name: name.trim(),
      image: primaryImage.trim(),
      images: imageArray,
      ownerId: req.user.userId,
      rating: 4.0,
    };

    if (video && video.trim()) restaurantData.video = video.trim();
    if (location) restaurantData.location = location;
    if (description && description.trim())
      restaurantData.description = description.trim();
    if (phone && phone.trim()) restaurantData.phone = phone.trim();
    if (cuisine && cuisine.trim()) restaurantData.cuisine = cuisine.trim();

    // ✅ NEW DINE-IN FIELDS
    if (dineInAvailable !== undefined) {
      restaurantData.dineInAvailable = dineInAvailable;
    }

    if (operatingHours && operatingHours.trim()) {
      restaurantData.operatingHours = operatingHours.trim();
    }

    if (bookingPhone && bookingPhone.trim()) {
      restaurantData.bookingPhone = bookingPhone.trim();
    }

    const restaurant = new Restaurant(restaurantData);
    await restaurant.save();

    res.status(201).json(restaurant);
  } catch (error) {
    logError("Create restaurant", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// UPDATE restaurant
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    if (restaurant.ownerId.toString() !== req.user.userId) {
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
      dineInAvailable, // ✅ NEW
      operatingHours, // ✅ NEW
      bookingPhone, // ✅ NEW
    } = req.body;

    if (name && name.trim()) restaurant.name = name.trim();

    if (images && Array.isArray(images) && images.length > 0) {
      restaurant.images = images.slice(0, 5);
      if (!image) restaurant.image = images[0];
    }

    if (image && image.trim()) restaurant.image = image.trim();
    if (video !== undefined) restaurant.video = video?.trim() || undefined;
    if (location !== undefined) restaurant.location = location;
    if (description !== undefined)
      restaurant.description = description?.trim() || undefined;
    if (phone !== undefined) restaurant.phone = phone?.trim() || undefined;
    if (cuisine !== undefined)
      restaurant.cuisine = cuisine?.trim() || undefined;

    // ✅ NEW DINE-IN FIELD UPDATES
    if (dineInAvailable !== undefined)
      restaurant.dineInAvailable = dineInAvailable;

    if (operatingHours !== undefined)
      restaurant.operatingHours = operatingHours?.trim() || undefined;

    if (bookingPhone !== undefined)
      restaurant.bookingPhone = bookingPhone?.trim() || undefined;

    await restaurant.save();
    res.json(restaurant);
  } catch (error) {
    logError("Update restaurant", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Add menu item
router.post("/:id/menu", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

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

// Delete menu item
router.delete("/menu/:menuId", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access required" });
    }

    const menuItem = await Menu.findById(req.params.menuId).populate(
      "restaurant_id",
    );

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    if (menuItem.restaurant_id.ownerId.toString() !== req.user.userId) {
      return res.status(403).json({
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
