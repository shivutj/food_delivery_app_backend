// middleware/adminAuth.js - NEW ADMIN-ONLY MIDDLEWARE
const jwt = require("jsonwebtoken");

const adminAuthMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify admin role
    if (decoded.role !== "admin") {
      return res.status(403).json({
        message: "Access denied. Admin privileges required.",
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = adminAuthMiddleware;

// ================================================================
// routes/auth.js - ADD ADMIN EMAIL VALIDATION TO REGISTRATION
// ================================================================

// Add this near the top of routes/auth.js:
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@fooddelivery.com";

// In the register route, add this validation for admin role:
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    // ✅ ADMIN EMAIL VALIDATION
    if (role === "admin" && email !== ADMIN_EMAIL) {
      return res.status(403).json({
        message:
          "Invalid admin credentials. Only authorized email can register as admin.",
      });
    }

    // Validate phone number (10 digits)
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

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with isVerified: false
    const user = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      role: role || "customer",
      isVerified: false,
    });
    await user.save();

    // ✅ Generate OTP for new user
    const otpCode = generateOTP();
    const otp = new OTP({
      userId: user._id,
      code: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await otp.save();

    console.log(`📱 OTP for ${email}: ${otpCode}`);

    res.status(201).json({
      message: "Registration successful. Please verify OTP sent to your phone.",
      userId: user._id,
      otp: otpCode,
    });
  } catch (error) {
    logError("Registration error", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ================================================================
// Add to .env file:
// ================================================================
// ADMIN_EMAIL=admin@fooddelivery.com
