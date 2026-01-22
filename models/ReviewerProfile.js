// models/ReviewerProfile.js
const mongoose = require("mongoose");

const reviewerProfileSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // Verification
    verified_mobile: {
      type: Boolean,
      default: false,
    },
    verified_email: {
      type: Boolean,
      default: false,
    },
    // Activity Stats
    total_reviews: {
      type: Number,
      default: 0,
    },
    total_orders: {
      type: Number,
      default: 0,
    },
    helpful_reviews: {
      type: Number,
      default: 0,
    },
    total_helpful_votes: {
      type: Number,
      default: 0,
    },
    // Account Info
    account_age_days: {
      type: Number,
      default: 0,
    },
    last_review_date: {
      type: Date,
    },
    // Trust & Reputation
    avg_trust_score: {
      type: Number,
      default: 50,
    },
    reviewer_level: {
      type: String,
      enum: ["bronze", "silver", "gold", "platinum", "elite"],
      default: "bronze",
    },
    total_points: {
      type: Number,
      default: 0,
    },
    // Rewards
    total_coins_earned: {
      type: Number,
      default: 0,
    },
    // Device & IP Tracking
    devices: [
      {
        fingerprint: String,
        first_seen: { type: Date, default: Date.now },
        last_seen: { type: Date, default: Date.now },
        review_count: { type: Number, default: 0 },
      },
    ],
    ip_addresses: [
      {
        ip: String,
        first_seen: { type: Date, default: Date.now },
        last_seen: { type: Date, default: Date.now },
        review_count: { type: Number, default: 0 },
      },
    ],
    // Ban/Moderation
    is_banned: {
      type: Boolean,
      default: false,
    },
    ban_reason: {
      type: String,
    },
    ban_expires_at: {
      type: Date,
    },
    warning_count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Calculate account age on save
reviewerProfileSchema.pre("save", function (next) {
  if (this.isNew) {
    this.account_age_days = 0;
  } else {
    const ageInMs = Date.now() - this.createdAt.getTime();
    this.account_age_days = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
  }
  next();
});

// Method to add points and update level
reviewerProfileSchema.methods.addPoints = function (points) {
  this.total_points += points;

  // Update reviewer level based on points
  if (this.total_points >= 1000) {
    this.reviewer_level = "elite";
  } else if (this.total_points >= 500) {
    this.reviewer_level = "platinum";
  } else if (this.total_points >= 250) {
    this.reviewer_level = "gold";
  } else if (this.total_points >= 100) {
    this.reviewer_level = "silver";
  } else {
    this.reviewer_level = "bronze";
  }
};

// Method to track device
reviewerProfileSchema.methods.trackDevice = function (fingerprint) {
  if (!fingerprint || fingerprint === "unknown") return;

  const existingDevice = this.devices.find(d => d.fingerprint === fingerprint);
  
  if (existingDevice) {
    existingDevice.last_seen = new Date();
    existingDevice.review_count += 1;
  } else {
    this.devices.push({
      fingerprint,
      first_seen: new Date(),
      last_seen: new Date(),
      review_count: 1,
    });
  }

  // Keep only last 10 devices
  if (this.devices.length > 10) {
    this.devices = this.devices.slice(-10);
  }
};

// Method to track IP
reviewerProfileSchema.methods.trackIP = function (ip) {
  if (!ip || ip === "unknown") return;

  const existingIP = this.ip_addresses.find(i => i.ip === ip);
  
  if (existingIP) {
    existingIP.last_seen = new Date();
    existingIP.review_count += 1;
  } else {
    this.ip_addresses.push({
      ip,
      first_seen: new Date(),
      last_seen: new Date(),
      review_count: 1,
    });
  }

  // Keep only last 10 IPs
  if (this.ip_addresses.length > 10) {
    this.ip_addresses = this.ip_addresses.slice(-10);
  }
};

const ReviewerProfile = mongoose.model("ReviewerProfile", reviewerProfileSchema);

module.exports = ReviewerProfile;