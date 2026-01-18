// utils/logger.js - ENHANCED WITH ADMIN NOTIFICATIONS
const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// In-memory critical error queue
let criticalErrors = [];
const MAX_CRITICAL_ERRORS = 50;

function logError(context, error) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [ERROR] ${context}: ${
    error.message || error
  }\n${error.stack || ""}\n\n`;

  console.error(logMessage);

  const logFile = path.join(
    logsDir,
    `error-${new Date().toISOString().split("T")[0]}.log`,
  );
  fs.appendFileSync(logFile, logMessage);

  const isCritical =
    context.includes("Database") ||
    context.includes("Auth") ||
    context.includes("Payment") ||
    error.message?.includes("ECONNREFUSED") ||
    error.message?.includes("MongoError");

  try {
    const SystemLog = require("../models/SystemLog");
    SystemLog.create({
      type: isCritical ? "error" : "warning",
      context,
      message: error.message || error.toString(),
      stack: error.stack,
      timestamp: new Date(),
    });

    if (isCritical) {
      criticalErrors.unshift({
        context,
        message: error.message || error.toString(),
        timestamp: new Date(),
      });

      if (criticalErrors.length > MAX_CRITICAL_ERRORS) {
        criticalErrors = criticalErrors.slice(0, MAX_CRITICAL_ERRORS);
      }
    }
  } catch (e) {
    console.error("Failed to log to database:", e);
  }
}

function logInfo(context, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [INFO] ${context}: ${message}\n`;
  console.log(logMessage);

  const logFile = path.join(
    logsDir,
    `info-${new Date().toISOString().split("T")[0]}.log`,
  );
  fs.appendFileSync(logFile, logMessage);
}

function logWarning(context, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [WARN] ${context}: ${message}\n`;
  console.warn(logMessage);

  try {
    const SystemLog = require("../models/SystemLog");
    SystemLog.create({
      type: "warning",
      context,
      message,
      timestamp: new Date(),
    });
  } catch (e) {
    console.error("Failed to log warning to database:", e);
  }
}

function getCriticalErrors() {
  return criticalErrors;
}

function clearCriticalErrors() {
  criticalErrors = [];
}

module.exports = {
  logError,
  logInfo,
  logWarning,
  getCriticalErrors,
  clearCriticalErrors,
};
