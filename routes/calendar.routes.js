const express = require("express");
const router = express.Router();
// Corrected path: calendar.controller.js is one level up, then in 'controllers' folder
const { sendInvite } = require("../controllers/calendar.controller");

router.post("/send-invite", sendInvite);

module.exports = router;