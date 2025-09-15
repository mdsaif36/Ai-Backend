// get-token.js
const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");

const credentials = require("./credential.json"); // Path: ./credential.json
const { client_secret, client_id, redirect_uris } = credentials.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("🔗 Visit this URL to authorize the app:\n", authUrl);

// CLI input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("\nPaste the code from the page here: ", async (code) => {
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    fs.writeFileSync("token.json", JSON.stringify(tokens)); // Path: ./token.json
    console.log("✅ token.json saved successfully!");
  } catch (err) {
    console.error("❌ Error retrieving access token", err);
  } finally {
    rl.close();
  }
});