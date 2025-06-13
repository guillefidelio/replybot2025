# SaaS Backend API Implementation Guide

This document explains how to implement your SaaS backend API that the Chrome extension will communicate with.

## Architecture Overview

```
Chrome Extension → Your SaaS API → OpenAI API
                ↑                ↓
            User Auth         AI Response
```

## Required Environment Variables

Update your `.env` file with your actual backend details:

```env
# SaaS Configuration for Review Responder Extension

# Your SaaS Backend API URL (replace with your actual backend)
VITE_SAAS_API_URL=https://api.reviewresponder.com/v1

# Your SaaS API Key (for extension to authenticate with your backend)
VITE_SAAS_API_KEY=rr_ext_sk_live_1234567890abcdef_your_extension_api_key_here
```

## API Endpoints

### 1. Generate Response Endpoint

**POST** `/generate-response`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {SAAS_API_KEY}
X-Extension-Version: {version}
```

**Request Body:**
```json
{
  "systemPrompt": "You are a professional business owner...",
  "userPrompt": "Review by John (5/5 stars): Great service!",
  "userToken": "user_abc123_token",
  "extensionVersion": "1.0.0"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "response": "Thank you so much for your wonderful review, John! We're thrilled to hear you had a great experience with our service.",
    "creditsUsed": 1,
    "creditsRemaining": 99
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Insufficient credits",
  "code": "CREDITS_EXHAUSTED"
}
```

### 2. Validate User Endpoint

**POST** `/validate-user`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {SAAS_API_KEY}
```

**Request Body:**
```json
{
  "userToken": "user_abc123_token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "plan": "pro",
    "creditsRemaining": 150,
    "planLimits": {
      "monthlyCredits": 500,
      "resetDate": "2025-02-01T00:00:00Z"
    }
  }
}
```

## Backend Implementation Examples

### Node.js/Express Example

```javascript
const express = require('express');
const OpenAI = require('openai');
const app = express();

// Your OpenAI API key (keep this secret on your backend)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Your extension API key for authentication
const EXTENSION_API_KEY = process.env.EXTENSION_API_KEY;

// Middleware
app.use(express.json());

// Authentication middleware
const authenticateExtension = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization' });
  }
  
  const token = authHeader.substring(7);
  if (token !== EXTENSION_API_KEY) {
    return res.status(401).json({ success: false, error: 'Invalid API key' });
  }
  
  next();
};

// Generate response endpoint
app.post('/v1/generate-response', authenticateExtension, async (req, res) => {
  try {
    const { systemPrompt, userPrompt, userToken } = req.body;
    
    // 1. Validate user and check credits
    const user = await validateUserCredits(userToken);
    if (!user.hasCredits) {
      return res.status(402).json({
        success: false,
        error: 'Insufficient credits',
        code: 'CREDITS_EXHAUSTED'
      });
    }
    
    // 2. Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 300,
      temperature: 0.7
    });
    
    const response = completion.choices[0].message.content;
    
    // 3. Deduct credits and update user
    await deductUserCredits(userToken, 1);
    const updatedUser = await getUserCredits(userToken);
    
    // 4. Return response
    res.json({
      success: true,
      data: {
        response: response,
        creditsUsed: 1,
        creditsRemaining: updatedUser.credits
      }
    });
    
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Validate user endpoint
app.post('/v1/validate-user', authenticateExtension, async (req, res) => {
  try {
    const { userToken } = req.body;
    const user = await getUserDetails(userToken);
    
    res.json({
      success: true,
      data: {
        valid: !!user,
        plan: user?.plan || 'free',
        creditsRemaining: user?.credits || 0,
        planLimits: user?.planLimits || {}
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

// Helper functions (implement based on your database)
async function validateUserCredits(userToken) {
  // Check if user exists and has credits
  // Return { hasCredits: boolean, credits: number }
}

async function deductUserCredits(userToken, amount) {
  // Deduct credits from user account
}

async function getUserCredits(userToken) {
  // Get current user credit balance
}

async function getUserDetails(userToken) {
  // Get full user details including plan, credits, etc.
}

app.listen(3000, () => {
  console.log('SaaS API server running on port 3000');
});
```

### Python/FastAPI Example

```python
from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel
import openai
import os

app = FastAPI()

# Your OpenAI API key (keep this secret)
openai.api_key = os.getenv("OPENAI_API_KEY")
EXTENSION_API_KEY = os.getenv("EXTENSION_API_KEY")

class GenerateRequest(BaseModel):
    systemPrompt: str
    userPrompt: str
    userToken: str
    extensionVersion: str

class ValidateRequest(BaseModel):
    userToken: str

# Authentication dependency
async def authenticate_extension(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    
    token = authorization[7:]  # Remove "Bearer "
    if token != EXTENSION_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    return True

@app.post("/v1/generate-response")
async def generate_response(
    request: GenerateRequest,
    authenticated: bool = Depends(authenticate_extension)
):
    try:
        # 1. Validate user credits
        user = await validate_user_credits(request.userToken)
        if not user["has_credits"]:
            raise HTTPException(
                status_code=402,
                detail={"success": False, "error": "Insufficient credits", "code": "CREDITS_EXHAUSTED"}
            )
        
        # 2. Call OpenAI
        response = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": request.systemPrompt},
                {"role": "user", "content": request.userPrompt}
            ],
            max_tokens=300,
            temperature=0.7
        )
        
        ai_response = response.choices[0].message.content
        
        # 3. Deduct credits
        await deduct_user_credits(request.userToken, 1)
        updated_user = await get_user_credits(request.userToken)
        
        return {
            "success": True,
            "data": {
                "response": ai_response,
                "creditsUsed": 1,
                "creditsRemaining": updated_user["credits"]
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail={"success": False, "error": str(e)})

@app.post("/v1/validate-user")
async def validate_user(
    request: ValidateRequest,
    authenticated: bool = Depends(authenticate_extension)
):
    try:
        user = await get_user_details(request.userToken)
        return {
            "success": True,
            "data": {
                "valid": bool(user),
                "plan": user.get("plan", "free") if user else "free",
                "creditsRemaining": user.get("credits", 0) if user else 0
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"success": False, "error": str(e)})

# Implement these functions based on your database
async def validate_user_credits(user_token: str):
    # Check user credits
    pass

async def deduct_user_credits(user_token: str, amount: int):
    # Deduct credits
    pass

async def get_user_credits(user_token: str):
    # Get credits
    pass

async def get_user_details(user_token: str):
    # Get user details
    pass
```

## Security Considerations

1. **API Key Security**: Your `SAAS_API_KEY` should be:
   - Long and random (32+ characters)
   - Stored securely in environment variables
   - Different for development/production
   - Rotated regularly

2. **Rate Limiting**: Implement rate limiting on your API:
   ```javascript
   const rateLimit = require('express-rate-limit');
   
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });
   
   app.use('/v1/', limiter);
   ```

3. **User Authentication**: Implement proper user token validation:
   - JWT tokens with expiration
   - Database lookup for user validation
   - Proper error handling for invalid tokens

4. **OpenAI API Key**: Never expose your OpenAI API key:
   - Keep it only on your backend
   - Use environment variables
   - Monitor usage and costs

## Deployment Options

### 1. Vercel (Serverless)
```bash
npm install -g vercel
vercel --prod
```

### 2. Railway
```bash
railway login
railway deploy
```

### 3. AWS Lambda
Use Serverless Framework or AWS CDK

### 4. Traditional VPS
Deploy with PM2, Docker, or similar

## Monitoring & Analytics

Consider implementing:
- Request logging
- Error tracking (Sentry)
- Usage analytics
- Cost monitoring
- Performance metrics

## Testing Your API

Use the extension's "Test Connection" feature or test manually:

```bash
curl -X POST https://your-api.com/v1/generate-response \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "systemPrompt": "Test prompt",
    "userPrompt": "Test review",
    "userToken": "test_user",
    "extensionVersion": "1.0.0"
  }'
```

## Next Steps

1. Set up your backend API using one of the examples above
2. Update your `.env` file with your actual API URL and key
3. Deploy your backend to a hosting service
4. Test the connection using the extension
5. Implement user authentication and billing
6. Add monitoring and analytics

Your Chrome extension is now configured to work as a SaaS product! 🚀 