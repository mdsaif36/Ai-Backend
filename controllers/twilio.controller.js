const { Twilio } = require("twilio");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const OpenAI = require("openai");

// Initialize OpenAI client (ensure OPENAI_API_KEY is in your .env)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory storage for conversation history per call
// For production, consider a more persistent store like Redis or a database
const conversations = {};

/**
 * @description Handles the initial incoming call from Twilio.
 */
const handleIncomingCall = (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;

  // Initialize conversation history for this new call with a system prompt
  conversations[callSid] = [
    {
      role: "system",
      content:
        "You are a friendly and helpful AI assistant for booking appointments. Your goal is to collect the necessary details like the desired service, date, and time. Once you have all the information, confirm the details with the user and state that the appointment is booked and a confirmation will be sent.",
    },
  ];

  twiml.say(
    "Hello! Thank you for calling. I can help you book an appointment. How can I assist you today?"
  );

  // Start listening for the user's speech
  twiml.gather({
    speechTimeout: "auto",
    speechModel: "experimental_conversations",
    input: "speech",
    action: `/api/twilio/response?callSid=${callSid}`, // Action URL for the response
  });

  res.type("text/xml");
  res.send(twiml.toString());
};

/**
 * @description Handles the user's spoken response and gets a reply from the AI.
 */
const handleSpeechResponse = async (req, res) => {
  const twiml = new VoiceResponse();
  const userSpeech = req.body.SpeechResult;
  const callSid = req.query.callSid;
  const conversationHistory = conversations[callSid];

  if (!conversationHistory) {
    twiml.say(
      "An error occurred with the conversation context. Please call back."
    );
    twiml.hangup();
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (userSpeech) {
    conversationHistory.push({ role: "user", content: userSpeech });

    try {
      // Get AI response from OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: conversationHistory,
      });
      const aiResponse = completion.choices[0].message.content;

      conversationHistory.push({ role: "assistant", content: aiResponse });

      twiml.say(aiResponse);

      // Check if the conversation goal is met to hang up the call
      if (aiResponse.toLowerCase().includes("appointment has been booked")) {
        twiml.say(
          "Thank you for using our service. You will receive a confirmation shortly. Goodbye!"
        );
        twiml.hangup();
        // Clean up the conversation from memory
        delete conversations[callSid];
      } else {
        // Continue the conversation
        twiml.gather({
          speechTimeout: "auto",
          speechModel: "experimental_conversations",
          input: "speech",
          action: `/api/twilio/response?callSid=${callSid}`,
        });
      }
    } catch (error) {
      console.error("OpenAI Error:", error);
      twiml.say(
        "Sorry, I encountered an error. Please try calling again later."
      );
      twiml.hangup();
    }
  } else {
    twiml.say(
      "I'm sorry, I didn't catch that. Could you please repeat yourself?"
    );
    // Re-gather input
    twiml.gather({
      speechTimeout: "auto",
      speechModel: "experimental_conversations",
      input: "speech",
      action: `/api/twilio/response?callSid=${callSid}`,
    });
  }

  res.type("text/xml");
  res.send(twiml.toString());
};

module.exports = {
  handleIncomingCall,
  handleSpeechResponse,
};
