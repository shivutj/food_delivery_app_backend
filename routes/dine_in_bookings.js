// routes/dine_in_bookings.js - DINE-IN BOOKING ROUTES
const express = require("express");
const router = express.Router();
const DineInBooking = require("../models/DineInBooking");
const Restaurant = require("../models/Restaurant");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// CREATE BOOKING (Customer)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      restaurant_id,
      booking_date,
      time_slot,
      number_of_guests,
      special_requests,
    } = req.body;

    // Validate restaurant exists and has dine-in
    const restaurant = await Restaurant.findById(restaurant_id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    if (!restaurant.dineInAvailable) {
      return res
        .status(400)
        .json({ message: "Dine-in not available at this restaurant" });
    }

    // Get user details
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create booking
    const booking = new DineInBooking({
      user_id: req.user.userId,
      restaurant_id,
      booking_date: new Date(booking_date),
      time_slot,
      number_of_guests,
      special_requests: special_requests || "",
      status: "Pending",
      customer_name: user.name,
      customer_phone: user.phone,
      customer_email: user.email,
    });

    await booking.save();

    console.log(`✅ Dine-in booking created for ${restaurant.name}`);
    console.log(`   Customer: ${user.name} (${user.phone})`);
    console.log(`   Date: ${booking_date}, Time: ${time_slot}`);
    console.log(`   Guests: ${number_of_guests}`);

    res.status(201).json({
      message: "Booking created successfully",
      booking: {
        id: booking._id,
        restaurant_name: restaurant.name,
        booking_date: booking.booking_date,
        time_slot: booking.time_slot,
        number_of_guests: booking.number_of_guests,
        status: booking.status,
      },
    });
  } catch (error) {
    logError("Create dine-in booking", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET ALL BOOKINGS FOR RESTAURANT OWNER
router.get("/restaurant", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    // Find restaurant owned by user
    const restaurant = await Restaurant.findOne({ ownerId: req.user.userId });
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Get all bookings for this restaurant
    const bookings = await DineInBooking.find({
      restaurant_id: restaurant._id,
    })
      .populate("user_id", "name phone email")
      .sort({ booking_date: 1, createdAt: -1 });

    console.log(
      `📋 Retrieved ${bookings.length} bookings for ${restaurant.name}`
    );

    res.json(bookings);
  } catch (error) {
    logError("Get restaurant bookings", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET USER'S BOOKINGS
router.get("/my-bookings", authMiddleware, async (req, res) => {
  try {
    const bookings = await DineInBooking.find({ user_id: req.user.userId })
      .populate("restaurant_id", "name image phone location")
      .sort({ booking_date: -1 });

    res.json(bookings);
  } catch (error) {
    logError("Get user bookings", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// UPDATE BOOKING STATUS (Restaurant Owner)
router.patch("/:id/status", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { status } = req.body;
    const validStatuses = ["Pending", "Confirmed", "Cancelled", "Completed"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const booking = await DineInBooking.findById(req.params.id).populate(
      "restaurant_id"
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Verify ownership
    if (booking.restaurant_id.ownerId.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "You can only update your restaurant's bookings" });
    }

    booking.status = status;
    await booking.save();

    console.log(`✅ Booking ${booking._id} status updated to: ${status}`);

    res.json({
      message: "Booking status updated",
      booking,
    });
  } catch (error) {
    logError("Update booking status", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET BOOKING BY ID
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const booking = await DineInBooking.findById(req.params.id)
      .populate("restaurant_id", "name image phone location")
      .populate("user_id", "name phone email");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Verify user can access this booking
    if (
      req.user.role !== "admin" &&
      booking.user_id._id.toString() !== req.user.userId
    ) {
      const restaurant = await Restaurant.findById(booking.restaurant_id._id);
      if (restaurant.ownerId.toString() !== req.user.userId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    res.json(booking);
  } catch (error) {
    logError("Get booking", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;