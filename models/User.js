// models/User.js - WITH LOCATION SUPPORT
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    isVerified: { type: Boolean, default: false },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },

    // ✅ NEW: User Location
    location: {
      address: { type: String },
      city: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
      type: { type: String, enum: ["home", "recent"], default: "home" },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
