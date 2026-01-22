// models/ReviewAuditLog.js
const mongoose = require("mongoose");

const reviewAuditLogSchema = new mongoose.Schema(
  {
    review_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
      required: true,
      index: true,
    },
    action_type: {
      type: String,
      enum: [
        "created",
        "updated",
        "deleted",
        "flagged",
        "hidden",
        "restored",
        "responded",
        "admin_action",
      ],
      required: true,
      index: true,
    },
    performed_by: {
      user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      role: {
        type: String,
        enum: ["user", "restaurant", "admin", "system"],
      },
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    ip_address: {
      type: String,
    },
    device_fingerprint: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
reviewAuditLogSchema.index({ review_id: 1, createdAt: -1 });
reviewAuditLogSchema.index({ action_type: 1, createdAt: -1 });
reviewAuditLogSchema.index({ "performed_by.user_id": 1 });

// Static method to log review action - simplified for routes
reviewAuditLogSchema.statics.logAction = async function (data) {
  try {
    const log = await this.create(data);
    console.log(`📝 Audit log created: ${data.action_type}`);
    return log;
  } catch (error) {
    console.error("❌ Failed to create audit log:", error);
    return null;
  }
};

// Static method to get review history
reviewAuditLogSchema.statics.getReviewHistory = async function (reviewId) {
  return await this.find({ review_id: reviewId })
    .sort({ createdAt: -1 })
    .populate("performed_by.user_id", "name email role")
    .lean();
};

const ReviewAuditLog = mongoose.model("ReviewAuditLog", reviewAuditLogSchema);

module.exports = ReviewAuditLog;