const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const functions = require('@google-cloud/functions-framework');

// Initialize the Secret Manager client
const secretClient = new SecretManagerServiceClient();

// Your secret resource name
const secretName = 'projects/662160411699/secrets/openai-api-key/versions/latest';

/**
 * HTTP Cloud Function to proxy OpenAI API requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
functions.http('openaiProxy', async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Only allow POST requests for the actual API call
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    // Validate request body
    if (!req.body || !req.body.messages) {
      res.status(400).json({ error: 'Missing required field: messages' });
      return;
    }

    // Get the OpenAI API key from Secret Manager
    console.log('Fetching OpenAI API key from Secret Manager...');
    const [version] = await secretClient.accessSecretVersion({
      name: secretName,
    });

    const apiKey = version.payload.data.toString();
    
    if (!apiKey) {
      throw new Error('Failed to retrieve API key from Secret Manager');
    }

    // Prepare the request to OpenAI
    const openaiRequest = {
      model: req.body.model || 'gpt-4o-mini',
      messages: req.body.messages,
      max_tokens: req.body.max_tokens || 1000,
      temperature: req.body.temperature || 0.7,
      ...req.body // Allow other OpenAI parameters to be passed through
    };

    console.log('Making request to OpenAI API...');
    
    // Make the request to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openaiRequest),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      res.status(response.status).json({
        error: 'OpenAI API error',
        details: errorData
      });
      return;
    }

    const data = await response.json();
    console.log('Successfully received response from OpenAI');
    
    // Return the OpenAI response
    res.status(200).json(data);

  } catch (error) {
    console.error('Error in openaiProxy function:', error);
    
    // Don't expose internal errors to the client
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process the request'
    });
  }
}); 