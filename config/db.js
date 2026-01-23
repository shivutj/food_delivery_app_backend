// config/db.js - IMPROVED WITH RETRY LOGIC
const mongoose = require("mongoose");

const connectDB = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000, // 10 seconds timeout
        socketTimeoutMS: 45000, // 45 seconds socket timeout
      });

      console.log("✅ MongoDB Connected");
      console.log(`📍 Database: ${mongoose.connection.name}`);
      return;
    } catch (error) {
      console.error(
        `❌ MongoDB connection attempt ${i + 1}/${retries} failed:`,
      );

      if (error.message.includes("IP")) {
        console.error("\n🚨 IP WHITELIST ERROR:");
        console.error("Your IP address is not whitelisted in MongoDB Atlas.");
        console.error("\n📋 Quick Fix:");
        console.error("1. Go to https://cloud.mongodb.com");
        console.error("2. Navigate to: Network Access");
        console.error("3. Click: Add IP Address");
        console.error("4. Click: Add Current IP Address");
        console.error("5. Wait 1-2 minutes and restart server\n");

        // Find your current IP
        console.error("💡 Or allow all IPs (dev only): 0.0.0.0/0\n");
        process.exit(1); // Exit immediately on IP whitelist error
      }

      if (i === retries - 1) {
        console.error("❌ All connection attempts failed");
        console.error("Error:", error.message);
        process.exit(1);
      }

      console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// Handle connection events
mongoose.connection.on("connected", () => {
  console.log("🔗 Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("🔌 Mongoose disconnected");
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("\n👋 MongoDB connection closed through app termination");
  process.exit(0);
});

module.exports = connectDB;
