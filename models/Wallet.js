// models/Wallet.js - USER WALLET SYSTEM
const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["credit", "debit", "review_reward", "order_payment", "withdrawal"],
    required: true,
  },
  amount: { type: Number, required: true },
  description: String,
  reference_id: String, // Order ID, Review ID, etc.
  timestamp: { type: Date, default: Date.now },
});

const walletSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  balance: { type: Number, default: 0, min: 0 },
  total_earned: { type: Number, default: 0 },
  total_spent: { type: Number, default: 0 },
  transactions: [transactionSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update timestamp on save
walletSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Wallet", walletSchema);
