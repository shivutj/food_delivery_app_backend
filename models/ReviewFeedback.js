// models/ReviewFeedback.js - COMMUNITY FEEDBACK TRACKING
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
    device_fingerprint: String,
    ip_address: String,
  },
  { timestamps: true },
);

// Compound index: one feedback per user per review
reviewFeedbackSchema.index({ review_id: 1, user_id: 1 }, { unique: true });
reviewFeedbackSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model("ReviewFeedback", reviewFeedbackSchema);
