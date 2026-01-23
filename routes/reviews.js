// routes/reviews.js - FIXED CHARACTER VALIDATION (COMPLETE FILE)
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

// Helper Functions
function calculateTrustScore(user, order, reviewerProfile, reviewText) {
  let score = 50;
  if (reviewerProfile) {
    const accountAgeDays = reviewerProfile.account_age_days;
    score += Math.min(accountAgeDays / 10, 15);
  }
  if (reviewerProfile && reviewerProfile.total_orders > 0) {
    score += Math.min(reviewerProfile.total_orders * 2, 15);
  }
  if (reviewerProfile && reviewerProfile.avg_trust_score > 50) {
    score += Math.min((reviewerProfile.avg_trust_score - 50) / 5, 10);
  }
  if (reviewerProfile) {
    if (reviewerProfile.verified_mobile) score += 5;
    if (reviewerProfile.verified_email) score += 5;
  }
  const wordCount = reviewText.split(/\s+/).length;
  if (wordCount >= 50) score += 10;
  else if (wordCount >= 30) score += 5;
  return Math.min(Math.round(score), 100);
}

function assignReviewLabels(reviewerProfile, isFirstReview, trustScore) {
  const labels = ["verified_order"];
  if (isFirstReview) labels.push("first_review");
  if (reviewerProfile) {
    if (reviewerProfile.total_reviews >= 10) labels.push("frequent_customer");
    if (["gold", "platinum", "elite"].includes(reviewerProfile.reviewer_level))
      labels.push("trusted_reviewer");
    if (reviewerProfile.total_orders >= 20) labels.push("high_value_customer");
  }
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
  } catch (error) {
    console.error("Audit log error:", error);
  }
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
    const existingReview = await Review.findOne({ order_id: orderId });
    if (existingReview) {
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
    const user = await User.findById(req.user.userId);
    if (!user.isVerified) {
      return res.json({
        eligible: false,
        reason: "mobile_not_verified",
        message: "Please verify your mobile number to submit reviews",
      });
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

// ==================== SUBMIT REVIEW (✅ FIXED CHARACTER VALIDATION) ====================
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

    const deliveryTime = order.updatedAt;
    const minReviewTime = new Date(deliveryTime.getTime() + 1 * 60 * 1000);
    if (new Date() < minReviewTime) {
      const remainingSeconds = Math.ceil((minReviewTime - new Date()) / 1000);
      return res.status(400).json({
        message: `Please wait ${remainingSeconds} more seconds`,
      });
    }

    const existingReview = await Review.findOne({ order_id });
    if (existingReview) {
      return res.status(400).json({ message: "Already reviewed" });
    }

    // ✅ FIXED: Removed minimum character requirement
    if (!review_text || review_text.trim().length === 0) {
      return res.status(400).json({
        message: "Please write something about your experience",
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

// ==================== GET RESTAURANT REVIEWS ====================
router.get("/restaurant/:restaurantId", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { sort = "recent", minTrustScore = 0 } = req.query;

    let sortQuery = {};
    if (sort === "recent") {
      sortQuery = { createdAt: -1 };
    } else if (sort === "helpful") {
      sortQuery = { helpful_count: -1, createdAt: -1 };
    } else if (sort === "rating_high") {
      sortQuery = { rating: -1, createdAt: -1 };
    } else if (sort === "rating_low") {
      sortQuery = { rating: 1, createdAt: -1 };
    }

    const reviews = await Review.find({
      restaurant_id: restaurantId,
      status: "active",
      trust_score: { $gte: parseInt(minTrustScore) },
    })
      .populate("user_id", "name profilePhoto")
      .sort(sortQuery)
      .lean();

    const enrichedReviews = await Promise.all(
      reviews.map(async (review) => {
        const reviewerProfile = await ReviewerProfile.findOne({
          user_id: review.user_id._id,
        });

        return {
          ...review,
          user_id: {
            _id: review.user_id._id,
            name: `${review.user_id.name.split(" ")[0]} ${review.user_id.name.split(" ")[1]?.[0] || ""}.`,
            profilePhoto: null,
          },
          reviewer_level: reviewerProfile?.reviewer_level || "bronze",
          reviewer_total_reviews: reviewerProfile?.total_reviews || 1,
        };
      }),
    );

    res.json({
      reviews: enrichedReviews,
      total: enrichedReviews.length,
    });
  } catch (error) {
    console.error("Get reviews error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== MARK HELPFUL ====================
router.post("/:reviewId/helpful", authMiddleware, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { is_helpful } = req.body;

    const existingFeedback = await ReviewFeedback.findOne({
      review_id: reviewId,
      user_id: req.user.userId,
    });

    if (existingFeedback) {
      return res.status(400).json({ message: "Already rated" });
    }

    const feedback = new ReviewFeedback({
      review_id: reviewId,
      user_id: req.user.userId,
      feedback_type: is_helpful ? "helpful" : "not_helpful",
      device_fingerprint: req.headers["x-device-fingerprint"] || "unknown",
      ip_address: req.ip,
    });
    await feedback.save();

    const review = await Review.findById(reviewId);
    if (review) {
      if (is_helpful) {
        review.helpful_count += 1;
      } else {
        review.not_helpful_count += 1;
      }
      await review.save();

      if (is_helpful) {
        const reviewerProfile = await ReviewerProfile.findOne({
          user_id: review.user_id,
        });
        if (reviewerProfile) {
          reviewerProfile.helpful_reviews += 1;
          reviewerProfile.total_helpful_votes += 1;
          reviewerProfile.addPoints(1);
          await reviewerProfile.save();
        }
      }
    }

    res.json({
      message: "Feedback recorded",
      helpful_count: review.helpful_count,
      not_helpful_count: review.not_helpful_count,
    });
  } catch (error) {
    console.error("Mark helpful error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== REPORT REVIEW ====================
router.post("/:reviewId/report", authMiddleware, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res
        .status(400)
        .json({ message: "Reason required (min 10 chars)" });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    const alreadyReported = review.reported_reasons.some(
      (r) => r.user_id.toString() === req.user.userId,
    );

    if (alreadyReported) {
      return res.status(400).json({ message: "Already reported" });
    }

    review.reported_reasons.push({
      user_id: req.user.userId,
      reason: reason.trim(),
      timestamp: new Date(),
    });
    review.report_count += 1;

    if (review.report_count >= 3 && review.status === "active") {
      review.status = "flagged";
      await logAudit(
        review._id,
        "flagged",
        { user_id: null, role: "system" },
        { auto_flagged: true, report_count: review.report_count },
        req,
      );
    }

    await review.save();

    res.json({
      message: "Review reported",
      report_count: review.report_count,
      status: review.status,
    });
  } catch (error) {
    console.error("Report review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== GET MY REVIEWS ====================
router.get("/my-reviews", authMiddleware, async (req, res) => {
  try {
    const reviews = await Review.find({ user_id: req.user.userId })
      .populate("restaurant_id", "name image")
      .populate("order_id", "total createdAt")
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    console.error("Get my reviews error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== GET REVIEWER PROFILE ====================
router.get("/reviewer-profile", authMiddleware, async (req, res) => {
  try {
    let profile = await ReviewerProfile.findOne({ user_id: req.user.userId });

    if (!profile) {
      profile = new ReviewerProfile({ user_id: req.user.userId });
      await profile.save();
    }

    res.json(profile);
  } catch (error) {
    console.error("Get reviewer profile error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
