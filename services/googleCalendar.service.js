const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

// --- Define the path to the token file in the application's root directory ---
const TOKEN_PATH = path.join(process.cwd(), "token.json");

// --- Create the OAuth2 client using environment variables ---
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// --- Function to load credentials before making an API call ---
const loadCredentials = async () => {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const token = fs.readFileSync(TOKEN_PATH);
      oAuth2Client.setCredentials(JSON.parse(token));
      console.log(`✅ Google credentials loaded successfully from ${TOKEN_PATH}`);
    } else {
      console.warn(`⚠️ token.json not found at ${TOKEN_PATH}. Google Calendar API will not be authenticated.`);
    }
  } catch (err) {
    console.error("❌ Error loading Google credentials:", err);
  }
};

// --- Function to create the calendar event ---
const createCalendarEvent = async (eventDetails) => {
  await loadCredentials();

  // ** THE FIX IS ON THE NEXT LINE **
  // Changed "oAuth2Clien" to "oAuth2Client"
  if (!oAuth2Client.credentials || !oAuth2Client.credentials.access_token) {
    throw new Error("Google API client is not authenticated. Please complete the OAuth2 flow.");
  }

  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  const event = {
    summary: eventDetails.summary,
    location: eventDetails.location,
    description: eventDetails.description,
    start: {
      dateTime: eventDetails.start,
      timeZone: "Asia/Kolkata",
    },
    end: {
      dateTime: eventDetails.end,
      timeZone: "Asia/Kolkata",
    },
    attendees: [{ email: eventDetails.email }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 10 },
      ],
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
      sendNotifications: true,
    });
    console.log("✅ Google Calendar event created:", response.data.htmlLink);
    return response.data;
  } catch (err) {
    console.error("❌ Error creating Google Calendar event:", err);
    throw new Error("Failed to create Google Calendar event.");
  }
};

module.exports = { createCalendarEvent };