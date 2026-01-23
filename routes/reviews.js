// routes/reviews.js - FIXED VERSION (1 MIN DELAY + WALLET INTEGRATION)

const express = require("express");
const router = express.Router();

const Review = require("../models/Review");
const ReviewerProfile = require("../models/ReviewerProfile");
const ReviewFeedback = require("../models/ReviewFeedback");
const ReviewReward = require("../models/ReviewReward");
const ReviewAuditLog = require("../models/ReviewAuditLog");
const Wallet = require("../models/Wallet");
const Order = require("../models/Order");
const User = require("../models/User");
const Menu = require("../models/Menu");

const authMiddleware = require("../middleware/auth");

// ==================== HELPERS ====================

function calculateTrustScore(user, order, reviewerProfile, reviewText) {
  let score = 50;

  if (reviewerProfile?.account_age_days) {
    score += Math.min(reviewerProfile.account_age_days / 10, 15);
  }

  if (reviewerProfile?.total_orders > 0) {
    score += Math.min(reviewerProfile.total_orders * 2, 15);
  }

  if (reviewerProfile?.avg_trust_score > 50) {
    score += Math.min((reviewerProfile.avg_trust_score - 50) / 5, 10);
  }

  if (reviewerProfile?.verified_mobile) score += 5;
  if (reviewerProfile?.verified_email) score += 5;

  const words = reviewText.split(/\s+/).length;
  if (words >= 50) score += 10;
  else if (words >= 30) score += 5;

  return Math.min(Math.round(score), 100);
}

function assignReviewLabels(reviewerProfile, isFirstReview, trustScore) {
  const labels = ["verified_order"];

  if (isFirstReview) labels.push("first_review");
  if (reviewerProfile?.total_reviews >= 10) labels.push("frequent_customer");
  if (["gold", "platinum", "elite"].includes(reviewerProfile?.reviewer_level))
    labels.push("trusted_reviewer");
  if (reviewerProfile?.total_orders >= 20) labels.push("high_value_customer");
  if (trustScore < 40) labels.push("low_confidence");

  return labels;
}

function generateReward() {
  return Math.floor(Math.random() * 100) + 1;
}

async function logAudit(reviewId, actionType, performedBy, details, req) {
  try {
    await ReviewAuditLog.create({
      review_id: reviewId,
      action_type: actionType,
      performed_by: performedBy,
      details,
      ip_address: req.ip || req.headers["x-forwarded-for"],
      device_fingerprint: req.headers["x-device-fingerprint"] || "unknown",
    });
  } catch (_) {}
}

// ==================== CHECK ELIGIBILITY ====================
router.get("/eligibility/:orderId", authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.user_id.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Not your order" });
    }

    if (order.reviewed) {
      return res.json({
        eligible: false,
        reason: "already_reviewed",
        message: "You have already reviewed this order",
      });
    }

    if (order.status !== "Delivered") {
      return res.json({
        eligible: false,
        reason: "order_not_delivered",
        message: "Order must be delivered first",
      });
    }

    const deliveryTime = order.updatedAt;
    const minReviewTime = new Date(deliveryTime.getTime() + 1 * 60 * 1000);

    if (new Date() < minReviewTime) {
      const remainingSeconds = Math.ceil((minReviewTime - new Date()) / 1000);
      return res.json({
        eligible: false,
        reason: "too_soon",
        message: `Please wait ${remainingSeconds} more seconds after delivery`,
        seconds_remaining: remainingSeconds,
      });
    }

    const reviewerProfile = await ReviewerProfile.findOne({
      user_id: req.user.userId,
    });

    if (reviewerProfile?.is_banned) {
      if (
        reviewerProfile.ban_expires_at &&
        new Date() > reviewerProfile.ban_expires_at
      ) {
        reviewerProfile.is_banned = false;
        reviewerProfile.ban_reason = null;
        reviewerProfile.ban_expires_at = null;
        await reviewerProfile.save();
      } else {
        return res.json({
          eligible: false,
          reason: "banned",
          message: "Your review privileges are temporarily suspended",
          ban_expires_at: reviewerProfile.ban_expires_at,
        });
      }
    }

    res.json({
      eligible: true,
      message: "You can review this order",
      reward_range: "1-100 coins (₹1-₹100)",
    });
  } catch (error) {
    console.error("Check eligibility error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
// ==================== SUBMIT REVIEW ====================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      order_id,
      emoji_sentiment,
      rating,
      food_quality_rating,
      delivery_rating,
      review_text,
      photos,
    } = req.body;

    if (!["thumbs_up", "thumbs_down"].includes(emoji_sentiment)) {
      return res.status(400).json({
        message: "Please select thumbs up or thumbs down",
      });
    }

    const order = await Order.findById(order_id);
    if (!order) {
      return res.status(400).json({ message: "Order not found" });
    }

    if (order.user_id.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Not your order" });
    }

    if (order.status !== "Delivered") {
      return res.status(400).json({ message: "Order not delivered yet" });
    }

    if (order.reviewed) {
      return res.status(400).json({ message: "Already reviewed" });
    }

    const deliveryTime = order.updatedAt;
    const minReviewTime = new Date(deliveryTime.getTime() + 1 * 60 * 1000);
    if (new Date() < minReviewTime) {
      const remainingSeconds = Math.ceil((minReviewTime - new Date()) / 1000);
      return res.status(400).json({
        message: `Please wait ${remainingSeconds} more seconds`,
      });
    }

    if (!review_text || review_text.trim().length < 80) {
      return res.status(400).json({
        message: "Review must be at least 80 characters",
      });
    }

    const user = await User.findById(req.user.userId);
    let reviewerProfile = await ReviewerProfile.findOne({
      user_id: req.user.userId,
    });

    if (!reviewerProfile) {
      reviewerProfile = new ReviewerProfile({
        user_id: req.user.userId,
        verified_mobile: user.phone ? true : false,
        verified_email: user.email ? true : false,
        total_orders: 1,
      });
      await reviewerProfile.save();
    }

    const trustScore = calculateTrustScore(
      user,
      order,
      reviewerProfile,
      review_text.trim(),
    );
    const isFirstReview = reviewerProfile.total_reviews === 0;
    const labels = assignReviewLabels(
      reviewerProfile,
      isFirstReview,
      trustScore,
    );
    const deviceFingerprint = req.headers["x-device-fingerprint"] || "unknown";
    const ipAddress = req.ip || req.headers["x-forwarded-for"] || "unknown";

    const restaurantId = order.items[0]?.menu_id
      ? (await Menu.findById(order.items[0].menu_id))?.restaurant_id
      : null;
    if (!restaurantId) {
      return res.status(400).json({ message: "Restaurant not found" });
    }

    const coinsReward = generateReward();

    const review = new Review({
      user_id: req.user.userId,
      restaurant_id: restaurantId,
      order_id,
      emoji_sentiment,
      rating,
      food_quality_rating,
      delivery_rating,
      review_text: review_text.trim(),
      photos: photos || [],
      trust_score: trustScore,
      labels,
      device_fingerprint: deviceFingerprint,
      ip_address: ipAddress,
      status: "active",
      coins_rewarded: coinsReward,
    });
    await review.save();

    order.reviewed = true;
    await order.save();

    const reward = new ReviewReward({
      user_id: req.user.userId,
      review_id: review._id,
      coins_amount: coinsReward,
      rupees_value: coinsReward,
      status: "credited",
      credited_at: new Date(),
    });
    await reward.save();

    let wallet = await Wallet.findOne({ user_id: req.user.userId });
    if (!wallet) {
      wallet = new Wallet({ user_id: req.user.userId });
    }
    wallet.balance += coinsReward;
    wallet.total_earned += coinsReward;
    wallet.transactions.push({
      type: "review_reward",
      amount: coinsReward,
      description: `Review reward for order #${order_id.substring(order_id.length - 8)}`,
      reference_id: review._id,
      timestamp: new Date(),
    });
    await wallet.save();

    reviewerProfile.total_reviews += 1;
    reviewerProfile.last_review_date = new Date();
    reviewerProfile.total_orders = await Order.countDocuments({
      user_id: req.user.userId,
      status: "Delivered",
    });
    reviewerProfile.total_coins_earned += coinsReward;
    reviewerProfile.addPoints(10);
    if (photos && photos.length > 0) reviewerProfile.addPoints(5);
    if (review_text.length > 200) reviewerProfile.addPoints(3);
    reviewerProfile.trackDevice(deviceFingerprint);
    reviewerProfile.trackIP(ipAddress);
    await reviewerProfile.save();

    await logAudit(
      review._id,
      "created",
      { user_id: req.user.userId, role: "user" },
      {
        emoji_sentiment,
        trust_score: trustScore,
        coins_rewarded: coinsReward,
      },
      req,
    );

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      review: {
        id: review._id,
        rating: review.rating,
        trust_score: review.trust_score,
        labels: review.labels,
        coins_rewarded: coinsReward,
      },
      wallet_balance: wallet.balance,
    });
  } catch (error) {
    console.error("Submit review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== OTHER ROUTES ====================

router.get("/restaurant/:restaurantId", async (req, res) => {
  const reviews = await Review.find({
    restaurant_id: req.params.restaurantId,
    status: "active",
  })
    .populate("user_id", "name")
    .sort({ createdAt: -1 });

  res.json({ reviews });
});

router.post("/:reviewId/helpful", authMiddleware, async (req, res) => {
  const exists = await ReviewFeedback.findOne({
    review_id: req.params.reviewId,
    user_id: req.user.userId,
  });

  if (exists) return res.status(400).json({ message: "Already rated" });

  await ReviewFeedback.create({
    review_id: req.params.reviewId,
    user_id: req.user.userId,
    feedback_type: req.body.is_helpful ? "helpful" : "not_helpful",
  });

  await Review.findByIdAndUpdate(req.params.reviewId, {
    $inc: req.body.is_helpful ? { helpful_count: 1 } : { not_helpful_count: 1 },
  });

  res.json({ message: "Feedback recorded" });
});

router.get("/my-reviews", authMiddleware, async (req, res) => {
  const reviews = await Review.find({ user_id: req.user.userId }).sort({
    createdAt: -1,
  });
  res.json(reviews);
});

router.get("/reviewer-profile", authMiddleware, async (req, res) => {
  let profile = await ReviewerProfile.findOne({ user_id: req.user.userId });
  if (!profile)
    profile = await ReviewerProfile.create({ user_id: req.user.userId });
  res.json(profile);
});

module.exports = router;
