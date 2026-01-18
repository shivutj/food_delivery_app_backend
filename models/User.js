// models/User.js - Updated with isVerified field
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, unique: true }, // Added unique
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    isVerified: { type: Boolean, default: false }, // NEW FIELD
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" }, // For restaurant owners
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
