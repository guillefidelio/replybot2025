// Simple MVP Backend for Review Responder Extension
// This is a basic Node.js/Express server that acts as a proxy to OpenAI

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors()); // Allow requests from Chrome extension
app.use(express.json());

// Simple logging
const log = (message, data = null) => {
  console.log(`[${new Date().toISOString()}] ${message}`, data || '');
};

// Generate response endpoint
app.post('/generate-response', async (req, res) => {
  try {
    const { systemPrompt, userPrompt, apiKey } = req.body;
    
    log('Received request for AI response generation');
    
    // Validate required fields
    if (!systemPrompt || !userPrompt || !apiKey) {
      return res.status(400).json({
        error: 'Missing required fields: systemPrompt, userPrompt, apiKey'
      });
    }
    
    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 300,
        temperature: 0.7
      })
    });
    
    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      log('OpenAI API error:', errorData);
      return res.status(openaiResponse.status).json({
        error: errorData.error?.message || 'OpenAI API error'
      });
    }
    
    const data = await openaiResponse.json();
    const aiResponse = data.choices[0]?.message?.content;
    
    if (!aiResponse) {
      return res.status(500).json({
        error: 'No response generated from OpenAI'
      });
    }
    
    log('Successfully generated AI response');
    
    // Return simple response format
    res.json({
      response: aiResponse
    });
    
  } catch (error) {
    log('Error in generate-response:', error.message);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  log(`🚀 MVP Backend server running on http://localhost:${PORT}`);
  log('Ready to receive requests from Chrome extension!');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down server...');
  process.exit(0);
}); 