// models/ReviewFeedback.js
const mongoose = require("mongoose");

const reviewFeedbackSchema = new mongoose.Schema(
  {
    review_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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

// Compound index to prevent duplicate feedback from same user on same review
reviewFeedbackSchema.index({ review_id: 1, user_id: 1 }, { unique: true });

const ReviewFeedback = mongoose.model("ReviewFeedback", reviewFeedbackSchema);

module.exports = ReviewFeedback;