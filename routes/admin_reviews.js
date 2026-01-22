// routes/admin_reviews.js - ADMIN REVIEW MODERATION
const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const ReviewerProfile = require("../models/ReviewerProfile");
const adminAuthMiddleware = require("../middleware/adminAuth");
const { logError } = require("../utils/logger");

// ==================== GET FLAGGED REVIEWS ====================
router.get("/flagged", adminAuthMiddleware, async (req, res) => {
  try {
    const flaggedReviews = await Review.find({ status: "flagged" })
      .populate("user_id", "name email phone")
      .populate("restaurant_id", "name")
      .populate("order_id", "total createdAt")
      .sort({ report_count: -1, createdAt: -1 })
      .lean();

    // Enrich with reviewer profiles
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
    logError("Get flagged reviews", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== GET ALL REVIEWS (ADMIN) ====================
router.get("/all", adminAuthMiddleware, async (req, res) => {
  try {
    const { status, minTrustScore, page = 1, limit = 50 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (minTrustScore) query.trust_score = { $gte: parseInt(minTrustScore) };

    const reviews = await Review.find(query)
      .populate("user_id", "name email phone")
      .populate("restaurant_id", "name")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const total = await Review.countDocuments(query);

    res.json({
      reviews,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    logError("Get all reviews", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== REVIEW DETAIL (ADMIN) ====================
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
    }).select("rating trust_score createdAt status");

    res.json({
      review,
      reviewer_profile: reviewerProfile,
      user_review_history: allUserReviews,
    });
  } catch (error) {
    logError("Get review detail", error);
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

    console.log(`✅ Review ${reviewId} approved by admin`);

    res.json({
      message: "Review approved",
      review,
    });
  } catch (error) {
    logError("Approve review", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== HIDE REVIEW ====================
router.patch("/:reviewId/hide", adminAuthMiddleware, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        message: "Please provide a reason (minimum 10 characters)",
      });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    review.status = "hidden";
    review.moderation_notes = reason.trim();
    await review.save();

    // Update reviewer profile
    const reviewerProfile = await ReviewerProfile.findOne({
      user_id: review.user_id,
    });

    if (reviewerProfile) {
      reviewerProfile.flagged_reviews += 1;
      reviewerProfile.warnings_count += 1;
      reviewerProfile.reviewer_score -= 20; // Penalty
      reviewerProfile.updateReviewerLevel();
      await reviewerProfile.save();
    }

    console.log(`⚠️ Review ${reviewId} hidden by admin`);
    console.log(`   Reason: ${reason}`);

    res.json({
      message: "Review hidden",
      review,
    });
  } catch (error) {
    logError("Hide review", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== DELETE REVIEW (PERMANENT) ====================
router.delete("/:reviewId", adminAuthMiddleware, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 20) {
      return res.status(400).json({
        message: "Deletion requires detailed reason (minimum 20 characters)",
      });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    const userId = review.user_id;

    // Mark as deleted (not physical delete for audit)
    review.status = "deleted";
    review.moderation_notes = `DELETED: ${reason.trim()}`;
    await review.save();

    // Severe penalty for reviewer
    const reviewerProfile = await ReviewerProfile.findOne({ user_id: userId });
    if (reviewerProfile) {
      reviewerProfile.flagged_reviews += 1;
      reviewerProfile.warnings_count += 1;
      reviewerProfile.reviewer_score -= 50; // Heavy penalty
      reviewerProfile.updateReviewerLevel();

      // Ban if too many violations
      if (reviewerProfile.warnings_count >= 3) {
        reviewerProfile.is_banned = true;
        reviewerProfile.ban_reason = "Multiple fake/inappropriate reviews";
        reviewerProfile.ban_expires_at = new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        ); // 90 days
      }

      await reviewerProfile.save();
    }

    console.log(`❌ Review ${reviewId} deleted by admin`);
    console.log(`   Reason: ${reason}`);

    res.json({
      message: "Review deleted permanently",
      reviewer_banned: reviewerProfile?.is_banned || false,
    });
  } catch (error) {
    logError("Delete review", error);
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
        return res.status(400).json({
          message: "Ban requires detailed reason (minimum 20 characters)",
        });
      }

      reviewerProfile.is_banned = true;
      reviewerProfile.ban_reason = reason.trim();
      reviewerProfile.ban_expires_at = new Date(
        Date.now() + parseInt(duration_days) * 24 * 60 * 60 * 1000,
      );

      console.log(`🚫 Reviewer ${userId} banned for ${duration_days} days`);
    } else {
      reviewerProfile.is_banned = false;
      reviewerProfile.ban_reason = null;
      reviewerProfile.ban_expires_at = null;

      console.log(`✅ Reviewer ${userId} unbanned`);
    }

    await reviewerProfile.save();

    res.json({
      message: ban ? "Reviewer banned" : "Reviewer unbanned",
      profile: reviewerProfile,
    });
  } catch (error) {
    logError("Ban/Unban reviewer", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== REVIEW STATISTICS ====================
router.get("/stats/overview", adminAuthMiddleware, async (req, res) => {
  try {
    const totalReviews = await Review.countDocuments();
    const activeReviews = await Review.countDocuments({ status: "active" });
    const flaggedReviews = await Review.countDocuments({ status: "flagged" });
    const hiddenReviews = await Review.countDocuments({ status: "hidden" });
    const deletedReviews = await Review.countDocuments({ status: "deleted" });

    const avgTrustScore = await Review.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: null, avgScore: { $avg: "$trust_score" } } },
    ]);

    const totalReviewers = await ReviewerProfile.countDocuments();
    const bannedReviewers = await ReviewerProfile.countDocuments({
      is_banned: true,
    });

    res.json({
      reviews: {
        total: totalReviews,
        active: activeReviews,
        flagged: flaggedReviews,
        hidden: hiddenReviews,
        deleted: deletedReviews,
        verified_percentage: ((activeReviews / totalReviews) * 100).toFixed(1),
      },
      trust: {
        avg_trust_score: avgTrustScore[0]?.avgScore.toFixed(1) || 0,
      },
      reviewers: {
        total: totalReviewers,
        banned: bannedReviewers,
      },
    });
  } catch (error) {
    logError("Get review stats", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
