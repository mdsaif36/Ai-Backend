const express = require("express");
const router = express.Router();
const twilioController = require("../controllers/twilio.controller");

// Route for incoming calls from Twilio
router.post("/incoming", twilioController.handleIncomingCall);

// Route to handle the speech-to-text response from the user
router.post("/response", twilioController.handleSpeechResponse);

module.exports = router;
