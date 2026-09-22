// oauth-setup.js
import { google } from 'googleapis';
import dotenv from 'dotenv';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import open from 'open'; // npm install open

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'http://localhost:3001/oauth2callback'
);

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // required to get a refresh token
  prompt: 'consent',      // forces refresh token even on repeat runs
  scope: SCOPES,
});

const server = http
  .createServer(async (req, res) => {
    if (!req.url.startsWith('/oauth2callback')) return;

    const code = new URL(req.url, 'http://localhost:3001').searchParams.get('code');
    res.end('Auth successful — you can close this tab.');
    server.close();

    const { tokens } = await oauth2Client.getToken(code);
    fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
    console.log('Saved tokens to token.json');

    oauth2Client.setCredentials(tokens);
    await testFetch();
  })
  .listen(3001, () => {
    console.log('Opening browser for consent...');
    open(authUrl);
  });

async function testFetch() {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 5,
  });

  const messages = res.data.messages || [];
  console.log(`Found ${messages.length} recent messages`);

  for (const m of messages) {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: m.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'Date'],
    });
    const headers = msg.data.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value;
    const from = headers.find(h => h.name === 'From')?.value;
    console.log(`- [${from}] ${subject}`);
  }
}
