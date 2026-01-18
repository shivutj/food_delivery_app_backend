// routes/auth.js - ENHANCED WITH VALIDATION & OTP
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OTP = require("../models/OTP");
const { logError } = require("../utils/logger");

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Register with enhanced validation and OTP
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    // Validate phone number (10 digits)
    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }
    
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: "Phone number must be exactly 10 digits" });
    }

    // ✅ Check email uniqueness
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // ✅ Check phone uniqueness
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ message: "Mobile number already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user with isVerified: false
    const user = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      role: role || "customer",
      isVerified: false, // NEW: User not verified yet
    });
    await user.save();

    // ✅ Generate OTP for new user
    const otpCode = generateOTP();
    const otp = new OTP({
      userId: user._id,
      code: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });
    await otp.save();

    console.log(`📱 OTP for ${email}: ${otpCode}`); // MVP: Log OTP (in production, send SMS)

    res.status(201).json({ 
      message: "Registration successful. Please verify OTP sent to your phone.",
      userId: user._id,
      otp: otpCode // MVP: Return OTP (remove in production)
    });
  } catch (error) {
    logError('Registration error', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Verify OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { userId, code } = req.body;

    const otp = await OTP.findOne({ userId, code });
    
    if (!otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (otp.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: otp._id });
      return res.status(400).json({ message: "OTP expired. Please register again." });
    }

    // Activate user
    await User.findByIdAndUpdate(userId, { isVerified: true });
    await OTP.deleteOne({ _id: otp._id });

    res.json({ message: "OTP verified successfully. You can now login." });
  } catch (error) {
    logError('OTP verification error', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Resend OTP
router.post("/resend-otp", async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    // Delete old OTP
    await OTP.deleteMany({ userId });

    // Generate new OTP
    const otpCode = generateOTP();
    const otp = new OTP({
      userId,
      code: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await otp.save();

    console.log(`📱 New OTP for ${user.email}: ${otpCode}`);

    res.json({ 
      message: "OTP resent successfully",
      otp: otpCode // MVP: Return OTP
    });
  } catch (error) {
    logError('Resend OTP error', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Login - check if user is verified
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // ✅ Check if user is verified
    if (!user.isVerified) {
  // Delete old OTPs
  await OTP.deleteMany({ userId: user._id });

  // Generate new OTP
  const otpCode = generateOTP();
  const otp = new OTP({
    userId: user._id,
    code: otpCode,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  await otp.save();

  console.log(`📱 OTP for ${user.email}: ${otpCode}`);

  return res.status(403).json({
    message: "Please verify your account first",
    userId: user._id,
    requiresOTP: true,
    otp: otpCode // ✅ DEMO MODE
  });
}

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    logError('Login error', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;