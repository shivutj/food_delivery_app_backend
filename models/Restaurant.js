// models/Restaurant.js - WITH DINE-IN SUPPORT (NO BREAKING CHANGES)
const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    image: { type: String, default: "https://via.placeholder.com/150" },
    images: [{ type: String }],
    video: { type: String },
    rating: { type: Number, default: 4.0 },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
    },
    description: { type: String },
    phone: { type: String },
    cuisine: { type: String },

    // ✅ NEW: Dine-in support (backward compatible - defaults to true)
    dineInAvailable: {
      type: Boolean,
      default: true, // ✅ Default to true for existing restaurants
    },

    // ✅ NEW: Operating hours (optional)
    operatingHours: {
      type: String,
      default: "9:00 AM - 10:00 PM",
    },

    // ✅ NEW: Table booking contact (optional)
    bookingPhone: {
      type: String,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Restaurant", restaurantSchema);
