const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

// --- UPDATED: Look for token.json in a temporary, writable directory ---
const TOKEN_PATH = path.join('/tmp', 'token.json');

// --- UPDATED: Load Google credentials from environment variables ---
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Safely load the token if it exists
try {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    console.log("✅ Successfully loaded existing token.json.");
  } else {
    console.log("📝 token.json not found. Server starting without authenticated client.");
  }
} catch (error) {
    console.error("❌ Error loading token.json:", error);
}

const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

module.exports = calendar;