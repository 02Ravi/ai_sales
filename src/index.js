const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const chatAgentService = require('./apps/chatAgent.service');
const { initializeDatabase } = require('./utils/db');




const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.json());
app.use(express.static('public'));

// Initialize database
initializeDatabase();

// Home route (optional: requires a public/index.html if you want a front end)
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: './public' });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    message: 'AI Sales Agent API',
    version: '1.0.0',
    endpoints: {
      chat: 'POST /chat',
      health: 'GET /health',
    },
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const response = await chatAgentService.processMessage(message, sessionId);

    res.json({
      success: true,
      response: response.message,
      extractedData: response.extractedData,
      sessionId,
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Get chat history for a session
app.get('/chat/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = await chatAgentService.getChatHistory(sessionId);

    res.json({
      success: true,
      sessionId,
      history,
    });

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Sales Agent server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/chat`);
});
