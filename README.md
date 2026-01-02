# 🤖 SPIROLINK Chatbot Backend

Secure Node.js/Express backend for ChatGPT integration. API key stays protected in `.env` file.

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create .env with your API key
# Edit .env file and add: OPENAI_API_KEY=sk-proj-...

# 3. Start backend
npm start
```

Server runs on: **http://localhost:5000**

## 📝 Environment Variables

Create `.env` file:
```
OPENAI_API_KEY=your-new-api-key-here
PORT=5000
NODE_ENV=development
```

**Get API key:** https://platform.openai.com/account/api-keys

## 🔌 API Endpoints

### Health Check
```
GET /health
```
Response: `{"status":"✅ Chatbot backend is running"}`

### Send Message
```
POST /chat
Content-Type: application/json

{
  "message": "What is PON technology?",
  "context": "You are a helpful chatbot for SPIROLINK"
}
```

Response:
```json
{
  "success": true,
  "reply": "PON (Passive Optical Network) is...",
  "model": "gpt-4o-mini"
}
```

## 🔐 Security

- API key stored in `.env` (never in code)
- `.env` in `.gitignore` (never committed)
- CORS configured for localhost only
- Error messages sanitized

## 📦 Dependencies

- `express` - Web server
- `cors` - Enable frontend requests
- `dotenv` - Load environment variables
- `openai` - Official OpenAI SDK

## 🧪 Testing

```bash
# Health check
curl http://localhost:5000/health

# Send message
curl -X POST http://localhost:5000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello!"}'
```

## 🐛 Common Issues

| Issue | Fix |
|-------|-----|
| "API key not set" | Add OPENAI_API_KEY to .env |
| "Invalid API key" | Get new key from OpenAI dashboard |
| "Port 5000 in use" | Change PORT in .env |
| "CORS error" | Backend already configured, check frontend URL |

## 📚 Model Info

- **Model:** gpt-4o-mini (fast and cost-effective)
- **Max tokens:** 500 per response
- **Temperature:** 0.7 (balanced creativity)

## 🚀 Production Deployment

For production, update CORS origin:
```javascript
origin: ["https://yourdomain.com"],
```

Deploy to: Render, Railway, Heroku, or AWS Lambda

---

**Backend ready!** Frontend connects at `http://localhost:5000/chat`
