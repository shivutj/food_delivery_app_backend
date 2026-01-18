// models/User.js - UPDATED WITH 3-ROLE SUPPORT
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    
    // ✅ FIXED: 3 ROLES - admin, restaurant, customer
    role: { 
      type: String, 
      enum: ["customer", "restaurant", "admin"], 
      default: "customer" 
    },
    
    isVerified: { type: Boolean, default: false },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },

    // Profile fields
    profilePhoto: { type: String },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);