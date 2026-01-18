// utils/logger.js - System Logger
const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function logError(context, error) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [ERROR] ${context}: ${error.message || error}\n${error.stack || ""}\n\n`;

  // Console log
  console.error(logMessage);

  // File log
  const logFile = path.join(
    logsDir,
    `error-${new Date().toISOString().split("T")[0]}.log`,
  );
  fs.appendFileSync(logFile, logMessage);

  // Store in database for admin notification (optional)
  try {
    const SystemLog = require("../models/SystemLog");
    SystemLog.create({
      type: "error",
      context,
      message: error.message || error.toString(),
      stack: error.stack,
      timestamp: new Date(),
    });
  } catch (e) {
    console.error("Failed to log to database:", e);
  }
}

function logInfo(context, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [INFO] ${context}: ${message}\n`;
  console.log(logMessage);
}

module.exports = { logError, logInfo };
