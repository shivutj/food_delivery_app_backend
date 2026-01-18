// models/User.js - ENHANCED VERSION (Compatible with existing code)
const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    isVerified: { type: Boolean, default: false },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },
    // NEW FIELDS (backward compatible - optional)
    profilePhoto: { type: String },
    address: { type: addressSchema },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
