// models/User.js - WITH PAN/AADHAAR SUPPORT + REVIEW REWARDS
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

    // ✅ ID Verification for Restaurant Owners
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

    // ✅ NEW: Coins/Wallet system for review rewards
    coins: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ✅ NEW: Phone verification for reviews
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerifiedAt: {
      type: Date,
    },

    // ✅ NEW: Device tracking for abuse prevention
    deviceFingerprints: [
      {
        fingerprint: String,
        lastSeen: Date,
      },
    ],
    ipAddresses: [
      {
        ip: String,
        lastSeen: Date,
      },
    ],

    // ✅ NEW: Review-related stats
    reviewStats: {
      totalReviews: {
        type: Number,
        default: 0,
      },
      helpfulReviews: {
        type: Number,
        default: 0,
      },
      totalRewardsEarned: {
        type: Number,
        default: 0,
      },
      lastReviewedAt: Date,
    },

    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    banReason: String,
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

// ✅ NEW: Method to add coins (from review rewards)
userSchema.methods.addCoins = async function (
  amount,
  source = "review_reward",
) {
  this.coins += amount;

  // Update review stats if from review
  if (source === "review_reward") {
    this.reviewStats.totalRewardsEarned += amount;
  }

  await this.save();

  console.log(
    `✅ Added ${amount} coins to user ${this.email}. New balance: ${this.coins}`,
  );

  return this.coins;
};

// ✅ NEW: Method to deduct coins (for orders or reversals)
userSchema.methods.deductCoins = async function (amount, reason = "order") {
  if (this.coins < amount) {
    throw new Error("Insufficient coins");
  }

  this.coins -= amount;
  await this.save();

  console.log(
    `✅ Deducted ${amount} coins from user ${this.email}. New balance: ${this.coins}`,
  );

  return this.coins;
};

// ✅ NEW: Method to track device for fraud prevention
userSchema.methods.trackDevice = async function (fingerprint, ipAddress) {
  // Track device fingerprint
  if (fingerprint) {
    const existingDevice = this.deviceFingerprints.find(
      (d) => d.fingerprint === fingerprint,
    );

    if (existingDevice) {
      existingDevice.lastSeen = new Date();
    } else {
      this.deviceFingerprints.push({
        fingerprint,
        lastSeen: new Date(),
      });
    }
  }

  // Track IP address
  if (ipAddress) {
    const existingIp = this.ipAddresses.find((ip) => ip.ip === ipAddress);

    if (existingIp) {
      existingIp.lastSeen = new Date();
    } else {
      this.ipAddresses.push({
        ip: ipAddress,
        lastSeen: new Date(),
      });
    }
  }

  // Keep only last 10 devices and IPs to prevent bloat
  if (this.deviceFingerprints.length > 10) {
    this.deviceFingerprints = this.deviceFingerprints.slice(-10);
  }
  if (this.ipAddresses.length > 10) {
    this.ipAddresses = this.ipAddresses.slice(-10);
  }

  await this.save();
};

// ✅ NEW: Virtual for wallet balance (1 coin = 1 rupee)
userSchema.virtual("walletBalance").get(function () {
  return this.coins;
});

module.exports = mongoose.model("User", userSchema);
