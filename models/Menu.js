// models/Menu.js - FINAL WITH VEG/NON-VEG & VIDEO
const mongoose = require("mongoose");

const menuSchema = new mongoose.Schema(
  {
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    name: { type: String, required: true },
    price: { type: Number, required: true }, // ✅ Integer prices only
    image: { type: String, default: "https://via.placeholder.com/150" },
    video: { type: String }, // ✅ NEW: Video URL
    category: { type: String, default: "Main Course" },
    description: { type: String },
    available: { type: Boolean, default: true },
    isVeg: { type: Boolean, default: true }, // ✅ NEW: Veg/Non-Veg flag
  },
  { timestamps: true },
);

module.exports = mongoose.model("Menu", menuSchema);
