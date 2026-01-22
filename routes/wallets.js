// routes/wallets.js - WALLET SYSTEM
const express = require("express");
const router = express.Router();
const Wallet = require("../models/Wallet");
const authMiddleware = require("../middleware/auth");
const { logError } = require("../utils/logger");

// ==================== GET WALLET ====================
router.get("/", authMiddleware, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ user_id: req.user.userId });

    if (!wallet) {
      wallet = new Wallet({
        user_id: req.user.userId,
        balance: 0,
        total_earned: 0,
        total_spent: 0,
        transactions: [],
      });
      await wallet.save();
    }

    res.json(wallet);
  } catch (error) {
    logError("Get wallet", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== ADD COINS (Review Reward) ====================
router.post("/add-coins", authMiddleware, async (req, res) => {
  try {
    const { amount, description, reference_id } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    let wallet = await Wallet.findOne({ user_id: req.user.userId });

    if (!wallet) {
      wallet = new Wallet({ user_id: req.user.userId });
    }

    wallet.balance += amount;
    wallet.total_earned += amount;
    wallet.transactions.push({
      type: "credit",
      amount,
      description: description || "Coins added",
      reference_id,
      timestamp: new Date(),
    });

    await wallet.save();

    res.json({
      message: "Coins added successfully",
      wallet,
    });
  } catch (error) {
    logError("Add coins", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ==================== TRANSACTION HISTORY ====================
router.get("/transactions", authMiddleware, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user_id: req.user.userId });

    if (!wallet) {
      return res.json({ transactions: [] });
    }

    // Sort transactions by date (newest first)
    const transactions = wallet.transactions.sort(
      (a, b) => b.timestamp - a.timestamp
    );

    res.json({ transactions });
  } catch (error) {
    logError("Get transactions", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;