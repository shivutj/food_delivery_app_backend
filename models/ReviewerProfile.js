// models/ReviewerProfile.js - REVIEWER REPUTATION SYSTEM
const mongoose = require("mongoose");

const reviewerProfileSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Reputation Stats
    total_reviews: {
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

    // Reviewer Level (Bronze, Silver, Gold, Platinum, Elite)
    reviewer_level: {
      type: String,
      enum: ["bronze", "silver", "gold", "platinum", "elite"],
      default: "bronze",
    },
    reviewer_score: {
      type: Number,
      default: 0, // 0-1000 points
    },

    // Account Metrics
    account_age_days: {
      type: Number,
      default: 0,
    },
    total_orders: {
      type: Number,
      default: 0,
    },
    orders_reviewed_percentage: {
      type: Number,
      default: 0,
    },

    // Trust Indicators
    avg_trust_score: {
      type: Number,
      default: 50,
    },
    verified_mobile: {
      type: Boolean,
      default: false,
    },
    verified_email: {
      type: Boolean,
      default: false,
    },

    // Abuse Detection
    flagged_reviews: {
      type: Number,
      default: 0,
    },
    warnings_count: {
      type: Number,
      default: 0,
    },
    is_banned: {
      type: Boolean,
      default: false,
    },
    ban_reason: String,
    ban_expires_at: Date,

    // Activity Pattern
    last_review_date: Date,
    review_frequency: {
      type: String,
      enum: ["occasional", "regular", "frequent", "power_reviewer"],
      default: "occasional",
    },

    // Badges & Achievements
    badges: [{
      type: String,
      enum: [
        "first_review",
        "10_reviews",
        "50_reviews",
        "100_reviews",
        "helpful_reviewer",
        "verified_customer",
        "photo_expert",
        "detailed_reviewer",
      ],
    }],

    // Device Tracking
    registered_devices: [{
      device_fingerprint: String,
      first_seen: Date,
      last_seen: Date,
    }],
  },
  { timestamps: true }
);

// Method to calculate reviewer level
reviewerProfileSchema.methods.updateReviewerLevel = function () {
  const score = this.reviewer_score;

  if (score >= 500) {
    this.reviewer_level = "elite";
  } else if (score >= 300) {
    this.reviewer_level = "platinum";
  } else if (score >= 150) {
    this.reviewer_level = "gold";
  } else if (score >= 50) {
    this.reviewer_level = "silver";
  } else {
    this.reviewer_level = "bronze";
  }
};

// Method to add reviewer points
reviewerProfileSchema.methods.addPoints = function (points) {
  this.reviewer_score += points;
  this.updateReviewerLevel();
};

module.exports = mongoose.model("ReviewerProfile", reviewerProfileSchema);