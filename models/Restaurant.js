// models/Restaurant.js - WITH IMAGE GALLERY SUPPORT
const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    image: { type: String, default: "https://via.placeholder.com/150" }, // Primary image (backward compatibility)
    images: [{ type: String }], // ✅ NEW: Gallery of up to 5 images
    video: { type: String }, // Video URL
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
  },
  { timestamps: true },
);

module.exports = mongoose.model("Restaurant", restaurantSchema);
