// Corrected path: googleCalendar.service.js is one level up, then in 'services' folder
const { createCalendarEvent } = require("../services/googleCalendar.service");

const sendInvite = async (req, res, next) => {
  try {
    const { email, summary, start, end, description, location } = req.body;

    if (!email || !summary || !start || !end) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    console.log("📨 Received calendar invite request:", req.body);

    const response = await createCalendarEvent({
      email,
      summary,
      start,
      end,
      description,
      location,
    });

    console.log("✅ Event created:", response.data);

    return res.status(201).json({
      success: true,
      message: "Invite sent",
      eventLink: response.data.htmlLink,
    });
  } catch (error) {
    console.error("❌ Error sending invite:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to send invite",
      detail: error.message,
    });
  }
};

module.exports = { sendInvite };