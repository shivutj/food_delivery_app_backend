// models/DineInBooking.js - DINE-IN BOOKING MODEL
const mongoose = require("mongoose");

const dineInBookingSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    booking_date: {
      type: Date,
      required: true,
    },
    time_slot: {
      type: String,
      required: true,
    },
    number_of_guests: {
      type: Number,
      required: true,
      min: 1,
      max: 50,
    },
    special_requests: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Cancelled", "Completed"],
      default: "Pending",
    },
    customer_name: String,
    customer_phone: String,
    customer_email: String,
  },
  { timestamps: true },
);

// Index for efficient queries
dineInBookingSchema.index({ restaurant_id: 1, booking_date: 1 });
dineInBookingSchema.index({ user_id: 1 });
dineInBookingSchema.index({ status: 1 });

module.exports = mongoose.model("DineInBooking", dineInBookingSchema);
