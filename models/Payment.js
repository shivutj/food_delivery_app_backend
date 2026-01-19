// models/Payment.js - ENHANCED VERSION
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    transaction_id: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Success", "Failed", "Cancelled"],
      default: "Pending",
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "upi", "card", "wallet"],
      default: "cod",
    },
    paymentDetails: {
      type: mongoose.Schema.Types.Mixed, // Store UPI ID, card last 4 digits, etc.
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Payment", paymentSchema);
