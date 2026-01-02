import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

let openai;

const initializeOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found in .env');
    process.exit(1);
  }
  return new OpenAI({ apiKey });
};

openai = initializeOpenAI();

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    apiKeyLoaded: !!process.env.OPENAI_API_KEY
  });
});

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    console.log('📨 Message:', message);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant for SPIROLINK, a broadband infrastructure company.'
        },
        {
          role: 'user',
          content: message.trim()
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const botMessage = completion.choices[0]?.message?.content;

    if (!botMessage) {
      return res.status(500).json({ success: false, error: 'No response from OpenAI' });
    }

    console.log('✅ Sent:', botMessage.substring(0, 50) + '...');

    return res.json({ success: true, reply: botMessage });

  } catch (error) {
    console.error('❌ Error:', error.message);

    if (error.status === 401) {
      return res.status(401).json({ success: false, error: 'Invalid API key - check your OpenAI account' });
    }

    if (error.status === 429) {
      return res.status(429).json({ success: false, error: 'OpenAI rate limit exceeded. Enable billing on your OpenAI account.' });
    }

    return res.status(500).json({ success: false, error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('✅ SPIROLINK Chatbot Backend');
  console.log('='.repeat(60));
  console.log(`🚀 Running on http://localhost:${PORT}`);
  console.log(`📝 POST /chat - Chat endpoint`);
  console.log(`❤️  GET /health - Health check`);
  console.log('='.repeat(60) + '\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} already in use!`);
    console.error(`Kill it: lsof -ti:${PORT} | xargs kill -9`);
    process.exit(1);
  }
});

process.on('SIGINT', () => {
  console.log('\n⚠️  Shutting down...');
  server.close(() => process.exit(0));
});

export default app;
