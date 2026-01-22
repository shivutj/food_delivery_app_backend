// server.js - COMPLETE WORKING VERSION WITH REVIEW ROUTES
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const connectDB = require("./config/db");
const compression = require("compression");
const sharp = require("sharp");
const helmet = require("helmet");

// Import Routes - DECLARE EACH ONLY ONCE
const paymentRoutes = require("./routes/payments");
const authRoutes = require("./routes/auth");
const restaurantRoutes = require("./routes/restaurants");
const orderRoutes = require("./routes/orders");
const analyticsRoutes = require("./routes/analytics");
const profileRoutes = require("./routes/profile");
const dineInBookingsRoutes = require("./routes/dine_in_bookings");
const reviewRoutes = require("./routes/reviews"); // ✅ Only declared once
const adminReviewRoutes = require("./routes/admin_reviews"); // ✅ Only declared once

// Import Models
const Menu = require("./models/Menu");
const Restaurant = require("./models/Restaurant");
const authMiddleware = require("./middleware/auth");

const walletRoutes = require("./routes/wallets");

const app = express();

// Connect to MongoDB
connectDB();

// Security & Compression
app.use(helmet());
app.use(compression());

// CORS
app.use(cors());
app.use(express.json());

// Create uploads directory
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files
app.use("/uploads", express.static(uploadsDir));

// Configure multer for IMAGE uploads (memory storage for compression)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for images
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/i;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = file.mimetype.startsWith("image/");

    if (extname || mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Configure multer for VIDEO uploads
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for videos
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|mov|avi|mkv/i;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = file.mimetype.startsWith("video/");

    if (extname || mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  },
});

// ==================== IMAGE UPLOAD WITH COMPRESSION ====================
app.post(
  "/api/upload",
  authMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      // Compress image to WebP format
      const compressedBuffer = await sharp(req.file.buffer)
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      // Save compressed file
      const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webp`;
      const filepath = path.join(uploadsDir, filename);
      await fs.promises.writeFile(filepath, compressedBuffer);

      const baseUrl = process.env.NGROK_URL || `http://192.168.31.100:5001`;
      const imageUrl = `${baseUrl}/uploads/${filename}`;

      console.log("✅ Image uploaded & compressed:", imageUrl);
      res.json({ imageUrl });
    } catch (error) {
      console.error("Upload error:", error);
      res
        .status(500)
        .json({ message: "Image upload failed", error: error.message });
    }
  },
);

// ==================== VIDEO UPLOAD ====================
app.post(
  "/api/upload-video",
  authMiddleware,
  videoUpload.single("video"),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No video file provided" });
      }

      const baseUrl = process.env.NGROK_URL || `http://192.168.31.100:5001`;
      const videoUrl = `${baseUrl}/uploads/${req.file.filename}`;

      console.log("✅ Video uploaded:", videoUrl);
      res.json({ videoUrl });
    } catch (error) {
      console.error("Video upload error:", error);
      res
        .status(500)
        .json({ message: "Video upload failed", error: error.message });
    }
  },
);

// ==================== MENU ROUTES ====================
app.post("/api/menu", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const {
      restaurant_id,
      name,
      price,
      image,
      category,
      description,
      available,
      isVeg,
      video,
    } = req.body;

    const restaurant = await Restaurant.findById(restaurant_id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    if (restaurant.ownerId.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "You can only add items to your own restaurant" });
    }

    const newMenuItem = new Menu({
      restaurant_id,
      name,
      price: parseInt(price),
      image: image || "https://via.placeholder.com/150",
      video: video || undefined,
      category: category || "Main Course",
      description: description || undefined,
      available: available !== undefined ? available : true,
      isVeg: isVeg !== undefined ? isVeg : true,
    });

    await newMenuItem.save();
    console.log("✅ Menu item created:", newMenuItem.name);
    res.status(201).json(newMenuItem);
  } catch (error) {
    console.error("❌ Add menu error:", error);
    res
      .status(500)
      .json({ message: "Failed to add menu item", error: error.message });
  }
});

app.put("/api/menu/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const menuItem = await Menu.findById(req.params.id).populate(
      "restaurant_id",
    );
    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    if (menuItem.restaurant_id.ownerId.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You can only update items from your own restaurant",
      });
    }

    const {
      name,
      price,
      image,
      category,
      description,
      available,
      isVeg,
      video,
    } = req.body;

    if (name) menuItem.name = name;
    if (price) menuItem.price = parseInt(price);
    if (image) menuItem.image = image;
    if (video !== undefined) menuItem.video = video;
    if (category) menuItem.category = category;
    if (description !== undefined) menuItem.description = description;
    if (available !== undefined) menuItem.available = available;
    if (isVeg !== undefined) menuItem.isVeg = isVeg;

    await menuItem.save();
    console.log("✅ Menu item updated:", menuItem.name);
    res.json(menuItem);
  } catch (error) {
    console.error("❌ Update menu error:", error);
    res
      .status(500)
      .json({ message: "Failed to update menu item", error: error.message });
  }
});

app.delete("/menu/:menuId", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access required" });
    }

    const menuItem = await Menu.findById(req.params.menuId).populate(
      "restaurant_id",
    );
    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    if (menuItem.restaurant_id.ownerId.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You can only delete items from your own restaurant",
      });
    }

    await Menu.findByIdAndDelete(req.params.menuId);
    console.log("✅ Menu item deleted");
    res.json({ message: "Menu item deleted" });
  } catch (error) {
    console.error("❌ Delete menu error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.put("/api/restaurants/:id/image", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "restaurant" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    if (restaurant.ownerId.toString() !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "You can only update your own restaurant" });
    }

    const { image } = req.body;
    restaurant.image = image;
    await restaurant.save();

    console.log("✅ Restaurant image updated");
    res.json(restaurant);
  } catch (error) {
    console.error("❌ Update restaurant image error:", error);
    res.status(500).json({
      message: "Failed to update restaurant image",
      error: error.message,
    });
  }
});

// ==================== REGISTER ALL ROUTES ====================
app.use("/auth", authRoutes);
app.use("/restaurants", restaurantRoutes);
app.use("/orders", orderRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/profile", profileRoutes);
app.use("/payments", paymentRoutes);
app.use("/dine-in-bookings", dineInBookingsRoutes);
app.use("/reviews", reviewRoutes); // ✅ Review routes
app.use("/admin/reviews", adminReviewRoutes); // ✅ Admin review routes

app.use("/wallets", walletRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Food Delivery API Running" });
});

// Error handling
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "File size too large. Max 5MB for images, 50MB for videos.",
      });
    }
    return res.status(400).json({ message: error.message });
  }

  if (error) {
    return res.status(500).json({ message: error.message });
  }

  next();
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Local: http://192.168.31.100:${PORT}`);
  console.log(`📁 Uploads: ${uploadsDir}`);
});
