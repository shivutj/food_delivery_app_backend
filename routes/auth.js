// routes/auth.js - COMPLETE AUTH ROUTES WITH ADMIN EMAIL VALIDATION
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OTP = require("../models/OTP");
const { logError } = require("../utils/logger");

// Admin email constant
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@fooddelivery.com";

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ✅ Validate PAN format
function validatePAN(pan) {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan);
}

// ✅ Validate Aadhaar format
function validateAadhaar(aadhaar) {
  const aadhaarRegex = /^[0-9]{12}$/;
  return aadhaarRegex.test(aadhaar);
}

// Register with ID verification for restaurant owners
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, role, idType, idNumber } = req.body;

    // ✅ ADMIN EMAIL VALIDATION
    if (role === "admin" && email !== ADMIN_EMAIL) {
      return res.status(403).json({
        message:
          "Invalid admin credentials. Only authorized email can register as admin.",
      });
    }

    // ✅ Validate phone number
    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res
        .status(400)
        .json({ message: "Phone number must be exactly 10 digits" });
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

    // ✅ RESTAURANT OWNER: Require ID verification
    if (role === "restaurant") {
      if (!idType || !idNumber) {
        return res.status(400).json({
          message:
            "ID verification (PAN or Aadhaar) is required for restaurant owners",
        });
      }

      // Validate ID format
      if (idType === "pan") {
        if (!validatePAN(idNumber)) {
          return res.status(400).json({
            message: "Invalid PAN format. Format should be: ABCDE1234F",
          });
        }
      } else if (idType === "aadhaar") {
        if (!validateAadhaar(idNumber)) {
          return res.status(400).json({
            message: "Invalid Aadhaar format. Must be 12 digits",
          });
        }
      } else {
        return res.status(400).json({
          message: "ID type must be either 'pan' or 'aadhaar'",
        });
      }

      // ✅ Check ID uniqueness
      const existingID = await User.findOne({
        "idVerification.number": idNumber,
      });

      if (existingID) {
        return res.status(400).json({
          message: `This ${idType.toUpperCase()} is already registered with another account`,
        });
      }

      console.log(`✅ ID Verification: ${idType.toUpperCase()} - ${idNumber}`);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with ID verification
    const userData = {
      name,
      email,
      password: hashedPassword,
      phone,
      role: role || "customer",
      isVerified: false,
    };

    // ✅ Add ID verification for restaurant owners
    if (role === "restaurant") {
      userData.idVerification = {
        type: idType,
        number: idNumber,
        verified: true, // Auto-verify (in production, integrate with govt APIs)
        verifiedAt: new Date(),
      };
    }

    const user = new User(userData);
    await user.save();

    // Generate OTP
    const otpCode = generateOTP();
    const otp = new OTP({
      userId: user._id,
      code: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await otp.save();

    console.log(`📱 OTP for ${email}: ${otpCode}`);

    const responseData = {
      message: "Registration successful. Please verify OTP sent to your phone.",
      userId: user._id,
      otp: otpCode,
    };

    // Include ID verification confirmation for restaurant owners
    if (role === "restaurant") {
      responseData.idVerification = {
        type: idType,
        verified: true,
        message: `${idType.toUpperCase()} verified successfully`,
      };
    }

    res.status(201).json(responseData);
  } catch (error) {
    // Handle duplicate key errors
    if (error.code === 11000) {
      if (error.keyPattern?.["idVerification.number"]) {
        return res.status(400).json({
          message: "This ID is already registered with another account",
        });
      }
    }

    logError("Registration error", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { userId, code } = req.body;

    const otp = await OTP.findOne({ userId, code });

    if (!otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (otp.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: otp._id });
      return res
        .status(400)
        .json({ message: "OTP expired. Please register again." });
    }

    await User.findByIdAndUpdate(userId, { isVerified: true });
    await OTP.deleteOne({ _id: otp._id });

    res.json({ message: "OTP verified successfully. You can now login." });
  } catch (error) {
    logError("OTP verification error", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Resend OTP
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

    await OTP.deleteMany({ userId });

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
      otp: otpCode,
    });
  } catch (error) {
    logError("Resend OTP error", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      await OTP.deleteMany({ userId: user._id });

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
        otp: otpCode,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    // ✅ Include ID verification status for restaurant owners
    if (user.role === "restaurant" && user.idVerification) {
      userData.idVerification = {
        type: user.idVerification.type,
        verified: user.idVerification.verified,
      };
    }

    res.json({
      token,
      user: userData,
    });
  } catch (error) {
    logError("Login error", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
