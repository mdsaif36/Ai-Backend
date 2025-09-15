require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("./utils/logger");
const errorHandler = require("./middlewares/errorHandler");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const os = require("os"); // 1. IMPORT THE 'os' MODULE

// --- DATABASE CONNECTION ---
const { testConnection } = require("./config/db");
testConnection();
// --- END DATABASE CONNECTION ---

const app = express();

// --- CORS CONFIGURATION ---
const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ||
  "http://localhost:5173,http://localhost:5000"
).split(",");
const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("This origin is not allowed by CORS"));
    }
  },
};
app.use(cors(corsOptions));
// --- END CORS CONFIGURATION ---

app.use(morgan);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// --- START: TEMPORARY AUTH ROUTE ---
app.get("/google/auth", (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
  res.redirect(authUrl);
});
// --- END: TEMPORARY AUTH ROUTE ---

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Authorization code missing.");
  }
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    // 2. USE os.tmpdir() to get the correct temporary directory path
    fs.writeFileSync(path.join(os.tmpdir(), "token.json"), JSON.stringify(tokens));

    if (tokens.refresh_token) {
      console.log(
        "========================================================================"
      );
      console.log("✅ SUCCESS! Your Refresh Token is:");
      console.log(tokens.refresh_token);
      console.log(
        "COPY THIS TOKEN and add it to your GOOGLE_REFRESH_TOKEN variable."
      );
      console.log(
        "========================================================================"
      );
    } else {
      console.log(
        "========================================================================"
      );
      console.log(
        "⚠️  A refresh token was NOT received. You may need to re-consent in Google."
      );
      console.log("Full token object:", tokens);
      console.log(
        "========================================================================"
      );
    }

    const frontendUrl = allowedOrigins[0];
    res.redirect(`${frontendUrl}/auth-success`);
  } catch (err) {
    console.error(
      "❌ Error retrieving access token during callback:",
      err.message
    );
    res.status(500).send("Error during authorization process.");
  }
});

// Application Routes
const authRoutes = require("./routes/auth.routes");
const calendarRoutes = require("./routes/calendar.routes");
const conversationRoutes = require("./routes/conversation.routes");
const twilioRoutes = require("./routes/twilio.routes");

app.use("/api/auth", authRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/conversation", conversationRoutes);
app.use("/api/twilio", twilioRoutes);

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3007;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
