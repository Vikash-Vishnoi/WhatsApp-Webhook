require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { verifyWebhook } = require('./src/webhook/verifier');
const { handleWebhook } = require('./src/webhook/handler');
const { connectToDatabase } = require('./src/database/mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
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

// Webhook verification endpoint (GET) - Meta will call this
app.get('/webhook', verifyWebhook);

// Webhook message handler (POST) - Meta will send messages here
app.post('/webhook', handleWebhook);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    availableEndpoints: ['/webhook', '/health']
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Database connection and server start
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
