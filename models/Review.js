// routes/reviews.js - COMPLETE GENUINE REVIEW SYSTEM
const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const ReviewerProfile = require("../models/ReviewerProfile");
const ReviewFeedback = require("../models/ReviewFeedback");
const ReviewReward = require("../models/ReviewReward");
const ReviewAuditLog = require("../models/ReviewAuditLog");
const Order = require("../models/Order");
const User = require("../models/User");
const Menu = require("../models/Menu");
const authMiddleware = require("../middleware/auth");

// ✅ HELPER: Calculate Trust Score
function calculateTrustScore(user, order, reviewerProfile, reviewText) {
  let score = 50; // Base score

  // Account age (max +15)
  if (reviewerProfile) {
    const accountAgeDays = reviewerProfile.account_age_days;
    score += Math.min(accountAgeDays / 10, 15);
  }

  // Order history (max +15)
  if (reviewerProfile && reviewerProfile.total_orders > 0) {
    score += Math.min(reviewerProfile.total_orders * 2, 15);
  }

  // Review quality (max +10)
  if (reviewerProfile && reviewerProfile.avg_trust_score > 50) {
    score += Math.min((reviewerProfile.avg_trust_score - 50) / 5, 10);
  }

  // Verified contact (max +10)
  if (reviewerProfile) {
    if (reviewerProfile.verified_mobile) score += 5;
    if (reviewerProfile.verified_email) score += 5;
  }

  // Review text quality (max +10)
  const wordCount = reviewText.split(/\s+/).length;
  if (wordCount >= 50) score += 10;
  else if (wordCount >= 30) score += 5;

  return Math.min(Math.round(score), 100);
}

// ✅ HELPER: Assign Review Labels
function assignReviewLabels(reviewerProfile, isFirstReview, trustScore) {
  const labels = ["verified_order"];

  if (isFirstReview) {
    labels.push("first_review");
  }

  if (reviewerProfile) {
    if (reviewerProfile.total_reviews >= 10) {
      labels.push("frequent_customer");
    }

    if (
      reviewerProfile.reviewer_level === "gold" ||
      reviewerProfile.reviewer_level === "platinum" ||
      reviewerProfile.reviewer_level === "elite"
    ) {
      labels.push("trusted_reviewer");
    }

    if (reviewerProfile.total_orders >= 20) {
      labels.push("high_value_customer");
    }
  }

  if (trustScore < 40) {
    labels.push("low_confidence");
  }

  return labels;
}

// ✅ HELPER: Generate Random Reward (1-100 coins)
function generateReward() {
  return Math.floor(Math.random() * 100) + 1;
}

// ✅ HELPER: Log Audit
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
    const startTime = Date.now();

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // ✅ Check ownership
    if (order.user_id.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Not your order" });
    }

    // ✅ Check if already reviewed
    const existingReview = await Review.findOne({ order_id: orderId });
    if (existingReview) {
      return res.json({
        eligible: false,
        reason: "already_reviewed",
        message: "You have already reviewed this order",
      });
    }

    // ✅ Check order status
    if (order.status !== "Delivered") {
      return res.json({
        eligible: false,
        reason: "order_not_delivered",
        message: "Order must be delivered first",
      });
    }

    // ✅ Check 30-minute delay
    const deliveryTime = order.updatedAt;
    const minReviewTime = new Date(deliveryTime.getTime() + 30 * 60 * 1000);

    if (new Date() < minReviewTime) {
      const remainingMinutes = Math.ceil((minReviewTime - new Date()) / 60000);
      return res.json({
        eligible: false,
        reason: "too_soon",
        message: `Please wait ${remainingMinutes} more minutes after delivery`,
        minutes_remaining: remainingMinutes,
      });
    }

    // ✅ Check if reviewer is banned
    const reviewerProfile = await ReviewerProfile.findOne({
      user_id: req.user.userId,
    });

    if (reviewerProfile?.is_banned) {
      if (
        reviewerProfile.ban_expires_at &&
        new Date() > reviewerProfile.ban_expires_at
      ) {
        // Unban
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

    // ✅ Check mobile verification
    const user = await User.findById(req.user.userId);
    if (!user.isVerified) {
      return res.json({
        eligible: false,
        reason: "mobile_not_verified",
        message: "Please verify your mobile number to submit reviews",
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Eligibility check completed in ${elapsed}ms`);

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
  const startTime = Date.now();

  try {
    const {
      order_id,
      emoji_sentiment, // ✅ NEW: thumbs_up or thumbs_down
      rating,
      food_quality_rating,
      delivery_rating,
      review_text,
      photos,
    } = req.body;

    console.log(`\n📝 SUBMIT REVIEW REQUEST`);
    console.log(`   User ID: ${req.user.userId}`);
    console.log(`   Order ID: ${order_id}`);

    // ✅ 1. Validate emoji sentiment
    if (
      !emoji_sentiment ||
      !["thumbs_up", "thumbs_down"].includes(emoji_sentiment)
    ) {
      return res.status(400).json({
        message: "Please select thumbs up or thumbs down",
      });
    }

    // ✅ 2. Validate order
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

    // ✅ 3. Check 30-min delay
    const deliveryTime = order.updatedAt;
    const minReviewTime = new Date(deliveryTime.getTime() + 30 * 60 * 1000);

    if (new Date() < minReviewTime) {
      const remainingMinutes = Math.ceil((minReviewTime - new Date()) / 60000);
      return res.status(400).json({
        message: `Please wait ${remainingMinutes} more minutes`,
      });
    }

    // ✅ 4. Check duplicate
    const existingReview = await Review.findOne({ order_id });
    if (existingReview) {
      return res.status(400).json({ message: "Already reviewed" });
    }

    // ✅ 5. Validate text length (minimum 80 chars)
    if (!review_text || review_text.trim().length < 80) {
      return res.status(400).json({
        message: "Review must be at least 80 characters",
      });
    }

    // ✅ 6. Get user & profile
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

    // ✅ 7. Calculate trust score
    const trustScore = calculateTrustScore(
      user,
      order,
      reviewerProfile,
      review_text.trim(),
    );

    // ✅ 8. Assign labels
    const isFirstReview = reviewerProfile.total_reviews === 0;
    const labels = assignReviewLabels(
      reviewerProfile,
      isFirstReview,
      trustScore,
    );

    // ✅ 9. Get device & IP
    const deviceFingerprint = req.headers["x-device-fingerprint"] || "unknown";
    const ipAddress = req.ip || req.headers["x-forwarded-for"] || "unknown";

    // ✅ 10. Get restaurant ID
    const restaurantId = order.items[0]?.menu_id
      ? (await Menu.findById(order.items[0].menu_id))?.restaurant_id
      : null;

    if (!restaurantId) {
      return res.status(400).json({ message: "Restaurant not found" });
    }

    // ✅ 11. Generate reward
    const coinsReward = generateReward();

    // ✅ 12. Create review
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

    // ✅ 13. Create reward record
    const reward = new ReviewReward({
      user_id: req.user.userId,
      review_id: review._id,
      coins_amount: coinsReward,
      rupees_value: coinsReward,
      status: "credited",
      credited_at: new Date(),
    });

    await reward.save();

    // ✅ 14. Update reviewer profile
    reviewerProfile.total_reviews += 1;
    reviewerProfile.last_review_date = new Date();
    reviewerProfile.total_orders = await Order.countDocuments({
      user_id: req.user.userId,
      status: "Delivered",
    });

    reviewerProfile.total_coins_earned += coinsReward;

    // Award points
    reviewerProfile.addPoints(10); // Base
    if (photos && photos.length > 0) reviewerProfile.addPoints(5);
    if (review_text.length > 200) reviewerProfile.addPoints(3);

    // Track device & IP
    reviewerProfile.trackDevice(deviceFingerprint);
    reviewerProfile.trackIP(ipAddress);

    await reviewerProfile.save();

    // ✅ 15. Log audit
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

    const elapsed = Date.now() - startTime;
    console.log(`✅ Review created in ${elapsed}ms`);
    console.log(`   Trust Score: ${trustScore}`);
    console.log(`   Coins Rewarded: ${coinsReward}`);

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
    });
  } catch (error) {
    console.error("Submit review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== GET RESTAURANT REVIEWS ====================
router.get("/restaurant/:restaurantId", async (req, res) => {
  const startTime = Date.now();

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

    // ✅ Enrich with reviewer profiles (anonymous to public)
    const enrichedReviews = await Promise.all(
      reviews.map(async (review) => {
        const reviewerProfile = await ReviewerProfile.findOne({
          user_id: review.user_id._id,
        });

        return {
          ...review,
          // ✅ ANONYMOUS: Only show first name + initial
          user_id: {
            _id: review.user_id._id,
            name: `${review.user_id.name.split(" ")[0]} ${review.user_id.name.split(" ")[1]?.[0] || ""}.`,
            profilePhoto: null, // Hide photo for anonymity
          },
          reviewer_level: reviewerProfile?.reviewer_level || "bronze",
          reviewer_total_reviews: reviewerProfile?.total_reviews || 1,
        };
      }),
    );

    const elapsed = Date.now() - startTime;
    console.log(`✅ Reviews loaded in ${elapsed}ms`);

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

    // ✅ Auto-flag if threshold reached (3 reports)
    if (review.report_count >= 3 && review.status === "active") {
      review.status = "flagged";
      console.log(
        `⚠️ Review ${reviewId} auto-flagged (${review.report_count} reports)`,
      );

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

// ==================== RESTAURANT RESPONSE ====================
router.post("/:reviewId/respond", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { reviewId } = req.params;
    const { response_text } = req.body;

    if (!response_text || response_text.trim().length < 20) {
      return res.status(400).json({ message: "Response min 20 chars" });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    const Restaurant = require("../models/Restaurant");
    const restaurant = await Restaurant.findOne({
      _id: review.restaurant_id,
      ownerId: req.user.userId,
    });

    if (!restaurant && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not your restaurant" });
    }

    if (review.restaurant_response?.text) {
      return res.status(400).json({ message: "Already responded" });
    }

    review.restaurant_response = {
      text: response_text.trim(),
      responded_at: new Date(),
      responded_by: req.user.userId,
    };

    await review.save();

    await logAudit(
      review._id,
      "admin_action",
      { user_id: req.user.userId, role: req.user.role },
      { action: "restaurant_response" },
      req,
    );

    res.json({
      message: "Response posted",
      response: review.restaurant_response,
    });
  } catch (error) {
    console.error("Restaurant response error:", error);
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

// ==================== SIMPLE AI FAKE DETECTION (Future Enhancement) ====================
// ✅ This is a placeholder for future AI-based detection
// Can be enabled after core system is stable
async function detectFakeReview(review, reviewerProfile) {
  const flags = {
    is_suspicious: false,
    detected_patterns: [],
    similarity_score: 0,
  };

  // 1. Check for repeated text patterns (simple implementation)
  const recentReviews = await Review.find({
    user_id: review.user_id,
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  }).limit(5);

  if (recentReviews.length >= 3) {
    flags.detected_patterns.push("multiple_reviews_in_short_time");
    flags.is_suspicious = true;
  }

  // 2. Check device/IP abuse
  if (reviewerProfile) {
    const sameDeviceReviews = reviewerProfile.devices.find(
      (d) => d.fingerprint === review.device_fingerprint && d.review_count > 5,
    );

    if (sameDeviceReviews) {
      flags.detected_patterns.push("excessive_device_usage");
    }

    const sameIPReviews = reviewerProfile.ip_addresses.find(
      (i) => i.ip === review.ip_address && i.review_count > 5,
    );

    if (sameIPReviews) {
      flags.detected_patterns.push("excessive_ip_usage");
    }
  }

  // 3. Check text length vs rating mismatch
  const wordCount = review.review_text.split(/\s+/).length;
  if (wordCount < 20 && review.rating === 5) {
    flags.detected_patterns.push("low_effort_high_rating");
  }

  return flags;
}

module.exports = router;
