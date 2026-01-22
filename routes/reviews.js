// routes/reviews.js - GENUINE REVIEW ROUTES
const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const ReviewerProfile = require("../models/ReviewerProfile");
const ReviewFeedback = require("../models/ReviewFeedback");
const Order = require("../models/Order");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// Helper: Calculate Trust Score
function calculateTrustScore(user, order, reviewerProfile) {
  let score = 50; // Base score

  // Account age (max +15 points)
  if (reviewerProfile) {
    const accountAge = reviewerProfile.account_age_days;
    score += Math.min(accountAge / 10, 15);
  }

  // Order history (max +15 points)
  if (reviewerProfile && reviewerProfile.total_orders > 0) {
    score += Math.min(reviewerProfile.total_orders * 2, 15);
  }

  // Review quality (max +10 points)
  if (reviewerProfile && reviewerProfile.avg_trust_score > 50) {
    score += Math.min((reviewerProfile.avg_trust_score - 50) / 5, 10);
  }

  // Verified contact (max +10 points)
  if (reviewerProfile) {
    if (reviewerProfile.verified_mobile) score += 5;
    if (reviewerProfile.verified_email) score += 5;
  }

  return Math.min(Math.round(score), 100);
}

// Helper: Assign Review Labels
function assignReviewLabels(reviewerProfile, isFirstReview) {
  const labels = ["verified_order"];

  if (isFirstReview) {
    labels.push("first_review");
  }

  if (reviewerProfile) {
    if (reviewerProfile.total_reviews >= 10) {
      labels.push("frequent_customer");
    }

    if (reviewerProfile.reviewer_level === "gold" || 
        reviewerProfile.reviewer_level === "platinum" || 
        reviewerProfile.reviewer_level === "elite") {
      labels.push("trusted_reviewer");
    }

    if (reviewerProfile.avg_trust_score < 40) {
      labels.push("low_confidence");
    }
  }

  return labels;
}

// ==================== CREATE REVIEW ====================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      order_id,
      rating,
      food_quality_rating,
      delivery_rating,
      review_text,
      photos,
    } = req.body;

    console.log(`\n📝 CREATE REVIEW REQUEST`);
    console.log(`   User ID: ${req.user.userId}`);
    console.log(`   Order ID: ${order_id}`);

    // 1. Validate Order
    const order = await Order.findById(order_id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 2. Verify Order Ownership
    if (order.user_id.toString() !== req.user.userId) {
      return res.status(403).json({ message: "You can only review your own orders" });
    }

    // 3. Check Order Status
    if (order.status !== "Delivered") {
      return res.status(400).json({ 
        message: "You can only review completed orders" 
      });
    }

    // 4. Check 30-minute Delay
    const deliveryTime = order.updatedAt;
    const minReviewTime = new Date(deliveryTime.getTime() + 30 * 60 * 1000);
    
    if (new Date() < minReviewTime) {
      const remainingMinutes = Math.ceil((minReviewTime - new Date()) / 60000);
      return res.status(400).json({
        message: `Please wait ${remainingMinutes} more minutes after delivery to submit review`,
      });
    }

    // 5. Check Duplicate Review
    const existingReview = await Review.findOne({ order_id });
    if (existingReview) {
      return res.status(400).json({ 
        message: "You have already reviewed this order" 
      });
    }

    // 6. Validate Review Text
    if (!review_text || review_text.trim().length < 80) {
      return res.status(400).json({
        message: "Review must be at least 80 characters long",
      });
    }

    // 7. Get User & Profile
    const user = await User.findById(req.user.userId);
    let reviewerProfile = await ReviewerProfile.findOne({ 
      user_id: req.user.userId 
    });

    if (!reviewerProfile) {
      // Create new reviewer profile
      reviewerProfile = new ReviewerProfile({
        user_id: req.user.userId,
        verified_mobile: user.phone ? true : false,
        verified_email: user.email ? true : false,
        total_orders: 1,
      });
      await reviewerProfile.save();
    }

    // 8. Calculate Trust Score
    const trustScore = calculateTrustScore(user, order, reviewerProfile);

    // 9. Assign Labels
    const isFirstReview = reviewerProfile.total_reviews === 0;
    const labels = assignReviewLabels(reviewerProfile, isFirstReview);

    // 10. Get Device Info
    const deviceFingerprint = req.headers["x-device-fingerprint"] || "unknown";
    const ipAddress = req.ip || req.headers["x-forwarded-for"] || "unknown";

    // 11. Get Restaurant ID from Order Items
    const restaurantId = order.items[0]?.menu_id 
      ? (await require("../models/Menu").findById(order.items[0].menu_id))?.restaurant_id
      : null;

    if (!restaurantId) {
      return res.status(400).json({ message: "Could not determine restaurant" });
    }

    // 12. Create Review
    const review = new Review({
      user_id: req.user.userId,
      restaurant_id: restaurantId,
      order_id,
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
    });

    await review.save();

    // 13. Update Reviewer Profile
    reviewerProfile.total_reviews += 1;
    reviewerProfile.last_review_date = new Date();
    reviewerProfile.total_orders = await Order.countDocuments({ 
      user_id: req.user.userId, 
      status: "Delivered" 
    });
    
    // Award points
    reviewerProfile.addPoints(10); // Base points for review
    if (photos && photos.length > 0) reviewerProfile.addPoints(5); // Photo bonus
    if (review_text.length > 200) reviewerProfile.addPoints(3); // Detailed review
    
    await reviewerProfile.save();

    console.log(`✅ Review created with trust score: ${trustScore}`);
    console.log(`   Labels: ${labels.join(", ")}`);

    res.status(201).json({
      message: "Review submitted successfully",
      review: {
        id: review._id,
        rating: review.rating,
        trust_score: review.trust_score,
        labels: review.labels,
      },
    });
  } catch (error) {
    console.error("Create review error:", error);
    logError("Create review", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== GET REVIEWS FOR RESTAURANT ====================
router.get("/restaurant/:restaurantId", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { sort = "recent", minTrustScore = 0 } = req.query;

    console.log(`\n📖 GET REVIEWS FOR RESTAURANT: ${restaurantId}`);

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

    // Enrich with reviewer profiles
    const enrichedReviews = await Promise.all(
      reviews.map(async (review) => {
        const reviewerProfile = await ReviewerProfile.findOne({
          user_id: review.user_id._id,
        });

        return {
          ...review,
          reviewer_level: reviewerProfile?.reviewer_level || "bronze",
          reviewer_total_reviews: reviewerProfile?.total_reviews || 1,
        };
      })
    );

    console.log(`✅ Found ${enrichedReviews.length} reviews`);

    res.json({
      reviews: enrichedReviews,
      total: enrichedReviews.length,
    });
  } catch (error) {
    console.error("Get reviews error:", error);
    logError("Get reviews", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== MARK REVIEW HELPFUL ====================
router.post("/:reviewId/helpful", authMiddleware, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { is_helpful } = req.body; // true or false

    // Check if user already voted
    const existingFeedback = await ReviewFeedback.findOne({
      review_id: reviewId,
      user_id: req.user.userId,
    });

    if (existingFeedback) {
      return res.status(400).json({ 
        message: "You have already rated this review" 
      });
    }

    // Create feedback
    const feedback = new ReviewFeedback({
      review_id: reviewId,
      user_id: req.user.userId,
      feedback_type: is_helpful ? "helpful" : "not_helpful",
      device_fingerprint: req.headers["x-device-fingerprint"] || "unknown",
      ip_address: req.ip,
    });

    await feedback.save();

    // Update review counts
    const review = await Review.findById(reviewId);
    if (review) {
      if (is_helpful) {
        review.helpful_count += 1;
      } else {
        review.not_helpful_count += 1;
      }
      await review.save();

      // Update reviewer profile if helpful
      if (is_helpful) {
        const reviewerProfile = await ReviewerProfile.findOne({
          user_id: review.user_id,
        });
        if (reviewerProfile) {
          reviewerProfile.helpful_reviews += 1;
          reviewerProfile.total_helpful_votes += 1;
          reviewerProfile.addPoints(1); // Small reward
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
    logError("Mark helpful", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== REPORT REVIEW ====================
router.post("/:reviewId/report", authMiddleware, async (req, res) => {
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

    // Check if user already reported
    const alreadyReported = review.reported_reasons.some(
      (r) => r.user_id.toString() === req.user.userId
    );

    if (alreadyReported) {
      return res.status(400).json({ 
        message: "You have already reported this review" 
      });
    }

    // Add report
    review.reported_reasons.push({
      user_id: req.user.userId,
      reason: reason.trim(),
      timestamp: new Date(),
    });

    review.report_count += 1;

    // Auto-flag if threshold reached
    if (review.report_count >= 3) {
      review.status = "flagged";
      console.log(`⚠️ Review ${reviewId} auto-flagged (${review.report_count} reports)`);
    }

    await review.save();

    res.json({ 
      message: "Review reported successfully",
      report_count: review.report_count,
      status: review.status,
    });
  } catch (error) {
    logError("Report review", error);
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
      return res.status(400).json({
        message: "Response must be at least 20 characters",
      });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Verify restaurant ownership
    const Restaurant = require("../models/Restaurant");
    const restaurant = await Restaurant.findOne({
      _id: review.restaurant_id,
      ownerId: req.user.userId,
    });

    if (!restaurant && req.user.role !== "admin") {
      return res.status(403).json({
        message: "You can only respond to reviews for your restaurant",
      });
    }

    if (review.restaurant_response && review.restaurant_response.text) {
      return res.status(400).json({ 
        message: "You have already responded to this review" 
      });
    }

    review.restaurant_response = {
      text: response_text.trim(),
      responded_at: new Date(),
      responded_by: req.user.userId,
    };

    await review.save();

    console.log(`✅ Restaurant responded to review ${reviewId}`);

    res.json({
      message: "Response posted successfully",
      response: review.restaurant_response,
    });
  } catch (error) {
    logError("Restaurant response", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== GET USER'S REVIEWS ====================
router.get("/my-reviews", authMiddleware, async (req, res) => {
  try {
    const reviews = await Review.find({ user_id: req.user.userId })
      .populate("restaurant_id", "name image")
      .populate("order_id", "total createdAt")
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    logError("Get my reviews", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== GET REVIEWER PROFILE ====================
router.get("/reviewer-profile", authMiddleware, async (req, res) => {
  try {
    let profile = await ReviewerProfile.findOne({ user_id: req.user.userId });

    if (!profile) {
      profile = new ReviewerProfile({
        user_id: req.user.userId,
      });
      await profile.save();
    }

    res.json(profile);
  } catch (error) {
    logError("Get reviewer profile", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== CHECK REVIEW ELIGIBILITY ====================
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

    // Check if already reviewed
    const existingReview = await Review.findOne({ order_id: orderId });
    if (existingReview) {
      return res.json({
        eligible: false,
        reason: "already_reviewed",
        message: "You have already reviewed this order",
      });
    }

    // Check order status
    if (order.status !== "Delivered") {
      return res.json({
        eligible: false,
        reason: "order_not_delivered",
        message: "Order must be delivered first",
      });
    }

    // Check 30-minute delay
    const deliveryTime = order.updatedAt;
    const minReviewTime = new Date(deliveryTime.getTime() + 30 * 60 * 1000);
    
    if (new Date() < minReviewTime) {
      const remainingMinutes = Math.ceil((minReviewTime - new Date()) / 60000);
      return res.json({
        eligible: false,
        reason: "too_soon",
        message: `Please wait ${remainingMinutes} more minutes`,
        minutes_remaining: remainingMinutes,
      });
    }

    // Check if reviewer is banned
    const reviewerProfile = await ReviewerProfile.findOne({ 
      user_id: req.user.userId 
    });

    if (reviewerProfile?.is_banned) {
      if (reviewerProfile.ban_expires_at && new Date() > reviewerProfile.ban_expires_at) {
        // Ban expired, unban
        reviewerProfile.is_banned = false;
        reviewerProfile.ban_reason = null;
        reviewerProfile.ban_expires_at = null;
        await reviewerProfile.save();
      } else {
        return res.json({
          eligible: false,
          reason: "banned",
          message: "Your review privileges are temporarily suspended",
        });
      }
    }

    res.json({
      eligible: true,
      message: "You can review this order",
    });
  } catch (error) {
    logError("Check review eligibility", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;