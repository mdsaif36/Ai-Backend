const express = require("express");
const morgan = require("morgan");
const calendarRoutes = require("./routes/calendar.routes");
const errorHandler = require("./middlewares/errorHandler");
const twilioRoutes = require("./routes/twilio.routes");
const app = express();

// Middleware
app.use(morgan("dev"));
app.use(express.json());

// Routes
app.use("/api/calendar", calendarRoutes);
app.use("/api/twilio", twilioRoutes);

// Error Handler
app.use(errorHandler);

module.exports = app;
