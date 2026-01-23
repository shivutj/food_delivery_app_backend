// models/ReviewFeedback.js - FIXED (Remove duplicate index)
const mongoose = require("mongoose");

const reviewFeedbackSchema = new mongoose.Schema(
  {
    review_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    feedback_type: {
      type: String,
      enum: ["helpful", "not_helpful"],
      required: true,
    },
    device_fingerprint: {
      type: String,
    },
    ip_address: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ FIXED: Only ONE compound index (removed duplicate single index)
reviewFeedbackSchema.index({ review_id: 1, user_id: 1 }, { unique: true });

const ReviewFeedback = mongoose.model("ReviewFeedback", reviewFeedbackSchema);

module.exports = ReviewFeedback;