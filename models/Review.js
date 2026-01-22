// models/Review.js - GENUINE REVIEW SYSTEM
const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    // Core References
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true, // One review per order
    },

    // Review Content
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    food_quality_rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    delivery_rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    review_text: {
      type: String,
      required: true,
      minlength: 80,
      maxlength: 2000,
    },

    // Photos (optional)
    photos: [
      {
        type: String,
      },
    ],

    // Trust & Verification
    is_verified: {
      type: Boolean,
      default: true, // Verified by order completion
    },
    trust_score: {
      type: Number,
      default: 50, // 0-100 scale
      min: 0,
      max: 100,
    },

    // Status & Moderation
    status: {
      type: String,
      enum: ["active", "hidden", "flagged", "deleted"],
      default: "active",
    },
    moderation_notes: String,

    // Community Feedback
    helpful_count: {
      type: Number,
      default: 0,
    },
    not_helpful_count: {
      type: Number,
      default: 0,
    },
    report_count: {
      type: Number,
      default: 0,
    },
    reported_reasons: [
      {
        user_id: mongoose.Schema.Types.ObjectId,
        reason: String,
        timestamp: Date,
      },
    ],

    // Labels
    labels: [
      {
        type: String,
        enum: [
          "verified_order",
          "frequent_customer",
          "trusted_reviewer",
          "low_confidence",
          "first_review",
        ],
      },
    ],

    // Metadata
    device_fingerprint: String,
    ip_address: String,
    submission_timestamp: {
      type: Date,
      default: Date.now,
    },

    // Restaurant Response
    restaurant_response: {
      text: String,
      responded_at: Date,
      responded_by: mongoose.Schema.Types.ObjectId,
    },

    // Audit Trail
    edited: {
      type: Boolean,
      default: false,
    },
    edit_history: [
      {
        previous_text: String,
        edited_at: Date,
      },
    ],
  },
  { timestamps: true },
);

// Indexes for performance
reviewSchema.index({ restaurant_id: 1, status: 1, createdAt: -1 });
reviewSchema.index({ user_id: 1, createdAt: -1 });
reviewSchema.index({ order_id: 1 }, { unique: true });
reviewSchema.index({ trust_score: -1 });
reviewSchema.index({ status: 1, trust_score: -1 });

// Virtual for overall helpfulness ratio
reviewSchema.virtual("helpfulness_ratio").get(function () {
  const total = this.helpful_count + this.not_helpful_count;
  return total > 0 ? this.helpful_count / total : 0;
});

module.exports = mongoose.model("Review", reviewSchema);
