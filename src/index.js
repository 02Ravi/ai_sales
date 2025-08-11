// Prefer IPv4 on Windows/corp Wi-Fi
require('dns').setDefaultResultOrder('ipv4first');

const { Agent, setGlobalDispatcher } = require('undici');

setGlobalDispatcher(new Agent({
  connections: 10,                 
  pipelining: 0,                   
  connect: { timeout: 15000 },     
  headersTimeout: 30000,         
  bodyTimeout: 120000,            
  keepAliveTimeout: 70_000,        
  keepAliveMaxTimeout: 70_000,
}));

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');

const { initializeDatabase, closeDatabase } = require('./utils/db');
const { processMessage, getChatHistory } = require('./apps/chatAgent.service');

// --- sanity logs for .env ---
const ENV_PATH = path.resolve(__dirname, '../.env');
console.log('[env] using:', ENV_PATH, 'exists:', fs.existsSync(ENV_PATH));
console.log('[env] GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

// static (if you serve your frontend from here)
app.use(express.static(path.resolve(__dirname, '../public')));

// db
initializeDatabase();

// health
app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// chat
app.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body || {};
    if (!message || !sessionId) {
      return res.status(400).json({ success: false, error: 'message and sessionId are required' });
    }

    // call the agent
    const out = await processMessage(message, sessionId);

    // shape the response exactly as your frontend expects
    return res.json({
      success: true,
      response: out.message,          // <-- your UI reads data.response
      extractedData: out.extractedData,
      drafts: out.drafts || {},
      sessionId
    });
  } catch (err) {
    console.error('POST /chat error:', err);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

// history (optional)
app.get('/history/:sessionId', async (req, res) => {
  try {
    const rows = await getChatHistory(req.params.sessionId);
    res.json({ success: true, messages: rows });
  } catch (err) {
    console.error('GET /history error:', err);
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

// start
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  closeDatabase();
  process.exit(0);
});
