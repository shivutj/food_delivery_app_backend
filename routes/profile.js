// routes/profile.js - NEW PROFILE MANAGEMENT ROUTES
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// Get user profile
router.get("/", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      profilePhoto: user.profilePhoto,
      address: user.address,
    });
  } catch (error) {
    logError("Get profile", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update profile photo
router.patch("/photo", authMiddleware, async (req, res) => {
  try {
    const { profilePhoto } = req.body;

    if (!profilePhoto) {
      return res.status(400).json({ message: "Profile photo URL required" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { profilePhoto },
      { new: true },
    ).select("-password");

    res.json({
      message: "Profile photo updated",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profilePhoto: user.profilePhoto,
        address: user.address,
      },
    });
  } catch (error) {
    logError("Update profile photo", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update address
router.patch("/address", authMiddleware, async (req, res) => {
  try {
    const { street, city, state, pincode, latitude, longitude } = req.body;

    if (!street || !city || !state || !pincode) {
      return res.status(400).json({ message: "All address fields required" });
    }

    const address = {
      street,
      city,
      state,
      pincode,
      latitude: latitude || null,
      longitude: longitude || null,
    };

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { address },
      { new: true },
    ).select("-password");

    res.json({
      message: "Address updated",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profilePhoto: user.profilePhoto,
        address: user.address,
      },
    });
  } catch (error) {
    logError("Update address", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update profile (name, phone)
router.patch("/", authMiddleware, async (req, res) => {
  try {
    const { name, phone } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (phone) {
      // Check if phone already exists for another user
      const existingPhone = await User.findOne({
        phone,
        _id: { $ne: req.user.userId },
      });

      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already in use" });
      }
      updates.phone = phone;
    }

    const user = await User.findByIdAndUpdate(req.user.userId, updates, {
      new: true,
    }).select("-password");

    res.json({
      message: "Profile updated",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profilePhoto: user.profilePhoto,
        address: user.address,
      },
    });
  } catch (error) {
    logError("Update profile", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
