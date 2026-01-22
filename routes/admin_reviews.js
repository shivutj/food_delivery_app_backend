// routes/admin_reviews.js - COMPLETE ADMIN MODERATION + ANALYTICS
const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const ReviewerProfile = require("../models/ReviewerProfile");
const ReviewAuditLog = require("../models/ReviewAuditLog");
const ReviewReward = require("../models/ReviewReward");
const Restaurant = require("../models/Restaurant");
const adminAuthMiddleware = require("../middleware/adminAuth");

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

// ==================== ANALYTICS DASHBOARD ====================
router.get("/analytics", adminAuthMiddleware, async (req, res) => {
  try {
    const { timeRange = "last30days" } = req.query;

    let startDate = new Date();
    if (timeRange === "today") {
      startDate.setHours(0, 0, 0, 0);
    } else if (timeRange === "last7days") {
      startDate.setDate(startDate.getDate() - 7);
    } else {
      startDate.setDate(startDate.getDate() - 30);
    }

    const query = { createdAt: { $gte: startDate } };

    // ✅ EMOJI SENTIMENT ANALYSIS
    const emojiStats = await Review.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$emoji_sentiment",
          count: { $sum: 1 },
          avg_trust_score: { $avg: "$trust_score" },
          avg_rating: { $avg: "$rating" },
        },
      },
    ]);

    const thumbsUp = emojiStats.find((s) => s._id === "thumbs_up") || {
      count: 0,
      avg_trust_score: 0,
      avg_rating: 0,
    };
    const thumbsDown = emojiStats.find((s) => s._id === "thumbs_down") || {
      count: 0,
      avg_trust_score: 0,
      avg_rating: 0,
    };

    const totalReviews = thumbsUp.count + thumbsDown.count;
    const positiveRatio =
      totalReviews > 0 ? (thumbsUp.count / totalReviews) * 100 : 0;

    // ✅ RESTAURANT RANKING IMPACT
    const rankingImpact = await Review.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$restaurant_id",
          total_impact: { $sum: "$ranking_impact" },
          thumbs_up_count: {
            $sum: { $cond: [{ $eq: ["$emoji_sentiment", "thumbs_up"] }, 1, 0] },
          },
          thumbs_down_count: {
            $sum: {
              $cond: [{ $eq: ["$emoji_sentiment", "thumbs_down"] }, 1, 0],
            },
          },
          avg_trust_score: { $avg: "$trust_score" },
        },
      },
      { $sort: { total_impact: -1 } },
      { $limit: 10 },
    ]);

    // Populate restaurant names
    const topRestaurants = await Promise.all(
      rankingImpact.map(async (r) => {
        const restaurant = await Restaurant.findById(r._id);
        return {
          restaurant_name: restaurant?.name || "Unknown",
          total_impact: r.total_impact,
          thumbs_up: r.thumbs_up_count,
          thumbs_down: r.thumbs_down_count,
          avg_trust_score: r.avg_trust_score.toFixed(1),
        };
      }),
    );

    // ✅ STATUS BREAKDOWN
    const statusStats = await Review.aggregate([
      { $match: query },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // ✅ TRUST SCORE DISTRIBUTION
    const trustDistribution = await Review.aggregate([
      { $match: query },
      {
        $bucket: {
          groupBy: "$trust_score",
          boundaries: [0, 20, 40, 60, 80, 100],
          default: "Other",
          output: { count: { $sum: 1 } },
        },
      },
    ]);

    // ✅ REWARDS ISSUED
    const rewardsStats = await ReviewReward.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: "credited",
        },
      },
      {
        $group: {
          _id: null,
          total_coins: { $sum: "$coins_amount" },
          total_rupees: { $sum: "$rupees_value" },
          count: { $sum: 1 },
        },
      },
    ]);

    const rewards = rewardsStats[0] || {
      total_coins: 0,
      total_rupees: 0,
      count: 0,
    };

    // ✅ TOP REVIEWERS
    const topReviewers = await ReviewerProfile.find()
      .sort({ reviewer_score: -1 })
      .limit(10)
      .select(
        "user_id reviewer_level reviewer_score total_reviews total_coins_earned",
      )
      .populate("user_id", "name email");

    res.json({
      timeRange,
      emoji_sentiment: {
        thumbs_up: {
          count: thumbsUp.count,
          avg_trust_score: thumbsUp.avg_trust_score.toFixed(1),
          avg_rating: thumbsUp.avg_rating.toFixed(1),
        },
        thumbs_down: {
          count: thumbsDown.count,
          avg_trust_score: thumbsDown.avg_trust_score.toFixed(1),
          avg_rating: thumbsDown.avg_rating.toFixed(1),
        },
        positive_ratio: positiveRatio.toFixed(1) + "%",
      },
      top_restaurants: topRestaurants,
      status_breakdown: statusStats,
      trust_distribution: trustDistribution,
      rewards_issued: {
        total_coins: rewards.total_coins,
        total_rupees: rewards.total_rupees,
        reviews_rewarded: rewards.count,
      },
      top_reviewers: topReviewers,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== GET FLAGGED REVIEWS ====================
router.get("/flagged", adminAuthMiddleware, async (req, res) => {
  try {
    const flaggedReviews = await Review.find({ status: "flagged" })
      .populate("user_id", "name email phone")
      .populate("restaurant_id", "name")
      .populate("order_id", "total createdAt")
      .sort({ report_count: -1, createdAt: -1 })
      .lean();

    const enriched = await Promise.all(
      flaggedReviews.map(async (review) => {
        const profile = await ReviewerProfile.findOne({
          user_id: review.user_id._id,
        });

        return {
          ...review,
          reviewer_profile: profile || null,
        };
      }),
    );

    res.json({
      flagged_reviews: enriched,
      total: enriched.length,
    });
  } catch (error) {
    console.error("Get flagged error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== REVIEW DETAIL ====================
router.get("/:reviewId", adminAuthMiddleware, async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId)
      .populate("user_id", "name email phone")
      .populate("restaurant_id", "name image")
      .populate("order_id")
      .lean();

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    const reviewerProfile = await ReviewerProfile.findOne({
      user_id: review.user_id._id,
    });

    const allUserReviews = await Review.find({
      user_id: review.user_id._id,
    }).select("rating trust_score createdAt status emoji_sentiment");

    const auditLog = await ReviewAuditLog.find({ review_id: review._id })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      review,
      reviewer_profile: reviewerProfile,
      user_review_history: allUserReviews,
      audit_log: auditLog,
    });
  } catch (error) {
    console.error("Get review detail error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== APPROVE REVIEW ====================
router.patch("/:reviewId/approve", adminAuthMiddleware, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { notes } = req.body;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    review.status = "active";
    review.moderation_notes = notes || "Approved by admin";
    await review.save();

    await logAudit(
      reviewId,
      "approved",
      { user_id: req.user.userId, role: "admin" },
      { notes },
      req,
    );

    res.json({ message: "Review approved", review });
  } catch (error) {
    console.error("Approve review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== HIDE REVIEW ====================
router.patch("/:reviewId/hide", adminAuthMiddleware, async (req, res) => {
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

    review.status = "hidden";
    review.moderation_notes = reason.trim();
    await review.save();

    const reviewerProfile = await ReviewerProfile.findOne({
      user_id: review.user_id,
    });

    if (reviewerProfile) {
      reviewerProfile.flagged_reviews += 1;
      reviewerProfile.warnings_count += 1;
      reviewerProfile.reviewer_score -= 20;
      reviewerProfile.updateReviewerLevel();
      await reviewerProfile.save();
    }

    await logAudit(
      reviewId,
      "hidden",
      { user_id: req.user.userId, role: "admin" },
      { reason: reason.trim() },
      req,
    );

    res.json({ message: "Review hidden", review });
  } catch (error) {
    console.error("Hide review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== DELETE REVIEW ====================
router.delete("/:reviewId", adminAuthMiddleware, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 20) {
      return res
        .status(400)
        .json({ message: "Deletion reason required (min 20 chars)" });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    const userId = review.user_id;

    review.status = "deleted";
    review.moderation_notes = `DELETED: ${reason.trim()}`;
    await review.save();

    const reviewerProfile = await ReviewerProfile.findOne({ user_id: userId });
    if (reviewerProfile) {
      reviewerProfile.flagged_reviews += 1;
      reviewerProfile.warnings_count += 1;
      reviewerProfile.reviewer_score -= 50;
      reviewerProfile.updateReviewerLevel();

      if (reviewerProfile.warnings_count >= 3) {
        reviewerProfile.is_banned = true;
        reviewerProfile.ban_reason = "Multiple fake/inappropriate reviews";
        reviewerProfile.ban_expires_at = new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        );
      }

      await reviewerProfile.save();
    }

    await logAudit(
      reviewId,
      "deleted",
      { user_id: req.user.userId, role: "admin" },
      { reason: reason.trim(), user_banned: reviewerProfile?.is_banned },
      req,
    );

    res.json({
      message: "Review deleted",
      reviewer_banned: reviewerProfile?.is_banned || false,
    });
  } catch (error) {
    console.error("Delete review error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== BAN/UNBAN REVIEWER ====================
router.patch("/reviewer/:userId/ban", adminAuthMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { ban, reason, duration_days = 30 } = req.body;

    let reviewerProfile = await ReviewerProfile.findOne({ user_id: userId });
    if (!reviewerProfile) {
      reviewerProfile = new ReviewerProfile({ user_id: userId });
    }

    if (ban) {
      if (!reason || reason.trim().length < 20) {
        return res
          .status(400)
          .json({ message: "Ban reason required (min 20 chars)" });
      }

      reviewerProfile.is_banned = true;
      reviewerProfile.ban_reason = reason.trim();
      reviewerProfile.ban_expires_at = new Date(
        Date.now() + parseInt(duration_days) * 24 * 60 * 60 * 1000,
      );
    } else {
      reviewerProfile.is_banned = false;
      reviewerProfile.ban_reason = null;
      reviewerProfile.ban_expires_at = null;
    }

    await reviewerProfile.save();

    res.json({
      message: ban ? "Reviewer banned" : "Reviewer unbanned",
      profile: reviewerProfile,
    });
  } catch (error) {
    console.error("Ban/Unban error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== AUDIT LOG ====================
router.get("/audit/log", adminAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, action_type } = req.query;

    const query = action_type ? { action_type } : {};

    const logs = await ReviewAuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("review_id", "rating status")
      .lean();

    const total = await ReviewAuditLog.countDocuments(query);

    res.json({
      logs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Get audit log error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
