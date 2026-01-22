// models/ReviewReward.js
const mongoose = require("mongoose");

const reviewRewardSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    review_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
      required: true,
      index: true,
    },
    coins_amount: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    rupees_value: {
      type: Number,
      required: true,
      // 1 coin = 1 rupee
    },
    status: {
      type: String,
      enum: ["pending", "credited", "failed", "reversed"],
      default: "pending",
    },
    credited_at: {
      type: Date,
    },
    expires_at: {
      type: Date,
      // Rewards expire after 90 days
      default: function () {
        return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      },
    },
    metadata: {
      device_fingerprint: String,
      ip_address: String,
      random_seed: String, // For audit trail of random generation
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance
reviewRewardSchema.index({ user_id: 1, createdAt: -1 });
reviewRewardSchema.index({ review_id: 1 }, { unique: true });
reviewRewardSchema.index({ status: 1 });
reviewRewardSchema.index({ expires_at: 1 });

// Static method to generate random reward
reviewRewardSchema.statics.generateRandomReward = function () {
  // Random between 1-100 coins
  return Math.floor(Math.random() * 100) + 1;
};

// Instance method to credit reward
reviewRewardSchema.methods.creditReward = async function () {
  if (this.status === "credited") {
    throw new Error("Reward already credited");
  }

  // Update user's coin balance (you'll need to implement this in User model)
  const User = mongoose.model("User");
  await User.findByIdAndUpdate(this.user_id, {
    $inc: { coins: this.coins_amount },
  });

  this.status = "credited";
  this.credited_at = new Date();
  await this.save();

  return this;
};

// Instance method to reverse reward (for fraud detection)
reviewRewardSchema.methods.reverseReward = async function () {
  if (this.status !== "credited") {
    throw new Error("Can only reverse credited rewards");
  }

  // Deduct coins from user
  const User = mongoose.model("User");
  await User.findByIdAndUpdate(this.user_id, {
    $inc: { coins: -this.coins_amount },
  });

  this.status = "reversed";
  await this.save();

  return this;
};

const ReviewReward = mongoose.model("ReviewReward", reviewRewardSchema);

module.exports = ReviewReward;
