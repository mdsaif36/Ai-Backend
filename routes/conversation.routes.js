const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversation.controller');

router.post('/start', conversationController.startConversation);
router.post('/voice-input', conversationController.handleVoiceInput);
router.post('/reset', conversationController.resetConversation);
// New route to stream audio
router.get('/audio/:filename', conversationController.streamAudio);

module.exports = router;