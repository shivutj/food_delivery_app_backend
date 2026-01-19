// models/User.js - WITH PAN/AADHAAR SUPPORT
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, unique: true },

    role: {
      type: String,
      enum: ["customer", "restaurant", "admin"],
      default: "customer",
    },

    isVerified: { type: Boolean, default: false },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },

    // ✅ NEW: ID Verification for Restaurant Owners
    idVerification: {
      type: {
        type: String,
        enum: ["pan", "aadhaar"],
      },
      number: {
        type: String,
        unique: true,
        sparse: true, // Allows null values while maintaining uniqueness
      },
      verified: {
        type: Boolean,
        default: false,
      },
      verifiedAt: Date,
    },

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

// ✅ Pre-save validation for restaurant role
userSchema.pre("save", function (next) {
  if (this.role === "restaurant" && !this.idVerification?.number) {
    return next(new Error("ID verification is required for restaurant owners"));
  }
  next();
});

module.exports = mongoose.model("User", userSchema);
