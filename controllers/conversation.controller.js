// This version removes the FFMPEG dependency entirely.
const fs = require('fs');
const path = require('path');
const os = require('os'); // 1. IMPORT THE 'os' MODULE
const OpenAI = require('openai');
const { createCalendarEvent } = require('../services/googleCalendar.service');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// WARNING: In-memory sessions are not suitable for production.
const sessions = {};
const generateSessionId = () => Math.random().toString(36).substring(2, 15);
const base64ToBuffer = (base64) => Buffer.from(base64, 'base64');

async function convertTextToSpeech(text) {
    const audioFileName = `response_${Date.now()}.mp3`;
    // 2. USE os.tmpdir() for the audio file path
    const audioFilePath = path.join(os.tmpdir(), audioFileName);
    try {
        const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: text });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(audioFilePath, buffer);
        return audioFileName;
    } catch (error) {
        console.error("Error in convertTextToSpeech:", error);
        throw new Error("Failed to convert text to speech using OpenAI.");
    }
}

// --- NEW transcribeAudio function (No FFMPEG) ---
// This function creates a WAV file header in memory and combines it with the raw PCM data.
async function transcribeAudio(audioBuffer, sampleRate) {
    const bitDepth = 16;
    const channels = 1;

    // Create the 44-byte WAV file header
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + audioBuffer.length, 4); // File size (header + data)
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Sub-chunk size (16 for PCM)
    header.writeUInt16LE(1, 20);  // Audio format (1 for PCM)
    header.writeUInt16LE(channels, 22); // Number of channels
    header.writeUInt32LE(sampleRate, 24); // Sample rate
    header.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28); // Byte rate
    header.writeUInt16LE(channels * (bitDepth / 8), 32); // Block align
    header.writeUInt16LE(bitDepth, 34); // Bits per sample
    header.write('data', 36);
    header.writeUInt32LE(audioBuffer.length, 40); // Data size

    const wavBuffer = Buffer.concat([header, audioBuffer]);

    // Save to a temporary file to create a readable stream for OpenAI
    const tempWavFileName = `temp_whisper_input_${Date.now()}.wav`;
    // 2. USE os.tmpdir() for the temporary WAV file path
    const tempWavFilePath = path.join(os.tmpdir(), tempWavFileName);
    fs.writeFileSync(tempWavFilePath, wavBuffer);

    try {
        const readStream = fs.createReadStream(tempWavFilePath);
        const transcription = await openai.audio.transcriptions.create({
            file: readStream,
            model: "whisper-1",
            response_format: "text",
            language: "en"
        });
        return transcription;
    } finally {
        // Clean up the temporary file
        fs.unlinkSync(tempWavFilePath);
    }
}

const tools = [
    {
        type: "function",
        function: {
            name: "create_calendar_event",
            description: "Creates a Google Calendar event for a dental appointment after collecting all necessary details.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "The full name of the patient." },
                    phone_number: { type: "string", description: "The patient's phone number." },
                    email: { type: "string", description: "The patient's email address." },
                    date: { type: "string", description: "The desired date for the appointment in YYYY-MM-DD format, e.g., 2025-08-15." },
                    time: { type: "string", description: "The desired time for the appointment in 24-hour HH:MM format, e.g., 14:30 for 2:30 PM." },
                    service: { type: "string", description: "The reason for the visit, e.g., 'Dental Cleaning', 'Wisdom Tooth Consultation'." },
                },
                required: ["name", "phone_number", "email", "date", "time", "service"],
            },
        },
    },
];

const startConversation = (req, res) => {
    const sessionId = generateSessionId();
    sessions[sessionId] = {
        history: [{
            role: 'system',
            content: 'You are Denty, a friendly and efficient AI assistant for BigSmile Dental Clinic. Your goal is to book appointments. You must collect the following information from the patient in a natural, conversational way: 1. Full Name, 2. Phone Number, 3. Email Address, 4. Desired Date (YYYY-MM-DD), 5. Desired Time (HH:MM), 6. Reason for visit. Once you have all six pieces of information, and only then, you must use the create_calendar_event tool to finalize the booking. Always confirm with the user after the tool has been used successfully.'
        }],
        lastActive: Date.now()
    };
    res.json({ success: true, sessionId });
};

const handleVoiceInput = async (req, res, next) => {
    const { sessionId, pcmData, sampleRate } = req.body;
    if (!sessionId || !pcmData) return res.status(400).json({ error: 'Missing session ID or PCM data.' });
    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    try {
        const audioBuffer = base64ToBuffer(pcmData);
        const effectiveSampleRate = sampleRate || 16000;
        const transcription = await transcribeAudio(audioBuffer, effectiveSampleRate);

        console.log("➡️ User says:", transcription);
        if (transcription) {
            session.history.push({ role: 'user', content: transcription });
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: session.history,
            tools: tools,
            tool_choice: "auto",
        });

        const responseMessage = response.choices[0].message;
        const toolCalls = responseMessage.tool_calls;
        let aiResponseContent;

        if (toolCalls) {
            console.log("✅ AI wants to use a tool.");
            session.history.push(responseMessage);
            const toolCall = toolCalls[0];
            const functionName = toolCall.function.name;

            if (functionName === 'create_calendar_event') {
                const args = JSON.parse(toolCall.function.arguments);
                console.log('✅ Tool arguments:', args);

                const startDateTime = new Date(`${args.date}T${args.time}:00`);
                const endDateTime = new Date(startDateTime.getTime() + 30 * 60000);

                const eventDetails = {
                    email: args.email,
                    summary: `${args.service} for ${args.name}`,
                    location: '123 Smile Street, Dental City, DC 54321',
                    description: `Patient: ${args.name}\nPhone: ${args.phone_number}\nReason: ${args.service}`,
                    start: startDateTime.toISOString(),
                    end: endDateTime.toISOString(),
                };

                await createCalendarEvent(eventDetails);
                console.log(`✅ Google Calendar invite sent to ${eventDetails.email}`);

                const toolOutput = `Successfully booked appointment for ${args.name} on ${args.date} at ${args.time}. Confirmation sent to ${args.email}.`;
                session.history.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: functionName,
                    content: toolOutput,
                });

                const finalResponse = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: session.history,
                });
                aiResponseContent = finalResponse.choices[0].message.content;
            }
        } else {
            aiResponseContent = responseMessage.content;
        }

        session.history.push({ role: 'assistant', content: aiResponseContent });
        console.log("⬅️ AI responds:", aiResponseContent);

        const audioFileName = await convertTextToSpeech(aiResponseContent);
        const audioUrl = `/api/conversation/audio/${audioFileName}`;
        res.json({
            success: true,
            transcription: transcription,
            aiResponse: aiResponseContent,
            audioFile: audioUrl,
        });

    } catch (error) {
        console.error("❌ Error in handleVoiceInput:", error); // Log the full error object
        next(error);
    }
};

const resetConversation = (req, res) => {
    const { sessionId } = req.body;
    if (sessions[sessionId]) {
        delete sessions[sessionId];
        res.json({ success: true, message: 'Session reset.' });
    } else {
        res.status(404).json({ success: false, error: 'Session not found.' });
    }
};

const streamAudio = (req, res) => {
    const { filename } = req.params;
    // 2. USE os.tmpdir() to stream the audio file from the correct directory
    const filePath = path.join(os.tmpdir(), filename);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'audio/mpeg');
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    } else {
        res.status(404).json({ success: false, error: 'Audio file not found.' });
    }
};

module.exports = { startConversation, handleVoiceInput, resetConversation, streamAudio };
