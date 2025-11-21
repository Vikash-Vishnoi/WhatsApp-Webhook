require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { verifyWebhook } = require('./src/webhook/verifier');
const { handleWebhook } = require('./src/webhook/handler');
const { verifySignatureMiddleware } = require('./src/webhook/signatureVerifier');
const { connectToDatabase } = require('./src/database/mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Body size limit to prevent memory exhaustion
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'WhatsApp Webhook Handler',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      webhook_get: '/webhook (GET - for verification)',
      webhook_post: '/webhook (POST - for messages)'
    }
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'whatsapp-webhook',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Webhook verification endpoint (GET)
app.get('/webhook', verifyWebhook);

// Webhook event endpoint (POST) with signature verification
app.post('/webhook', verifySignatureMiddleware, handleWebhook);

app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    availableEndpoints: ['/webhook', '/health']
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

console.log('🚀 Starting WhatsApp Webhook Server...');
console.log('📍 Environment:', process.env.NODE_ENV || 'development');
console.log('🔐 Verify Token:', process.env.WHATSAPP_VERIFY_TOKEN ? '✅ Set' : '❌ Missing');
console.log('🗄️  MongoDB URI:', process.env.MONGODB_URI ? '✅ Set' : '❌ Missing');

connectToDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Database connected successfully');
      console.log(`🌐 Webhook server running on port ${PORT}`);
      console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
      console.log('🎯 Ready to receive WhatsApp messages!');
    });
  })
  .catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
