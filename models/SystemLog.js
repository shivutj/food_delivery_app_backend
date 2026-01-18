// models/SystemLog.js - System Logs for Admin
const mongoose = require("mongoose");

const systemLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["error", "warning", "info"],
      required: true,
    },
    context: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    stack: String,
    timestamp: {
      type: Date,
      default: Date.now,
    },
    resolved: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Auto-delete logs older than 30 days
systemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model("SystemLog", systemLogSchema);
