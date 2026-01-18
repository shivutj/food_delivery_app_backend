// models/Restaurant.js - Updated with owner and location
const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    image: { type: String, default: "https://via.placeholder.com/150" },
    video: { type: String }, // NEW: Video URL
    rating: { type: Number, default: 4.0 },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }, // NEW: Restaurant owner
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
    }, // NEW: Location for restaurant
  },
  { timestamps: true },
);

module.exports = mongoose.model("Restaurant", restaurantSchema);
