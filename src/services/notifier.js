/**
 * Real-time Notification Service
 * 
 * Sends real-time updates to connected clients when new messages arrive
 */

const axios = require('axios');

// Your main backend server URL (where your mobile app connects)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

/**
 * Notify connected clients about new messages
 */
exports.notifyClients = async (notification) => {
  try {
    console.log('📡 Sending notification to backend...');
    
    // You can use Socket.io, webhooks, or HTTP POST to notify your backend
    // For now, we'll use a simple HTTP POST
    
    // Option 1: POST to your backend API
    if (BACKEND_URL) {
      try {
        await axios.post(`${BACKEND_URL}/api/webhook/notification`, notification, {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': process.env.WEBHOOK_SECRET || 'your-secret-key'
          }
        });
        console.log('✅ Notification sent to backend');
      } catch (error) {
        console.log('⚠️  Backend notification failed (backend might be offline):', error.message);
        // Don't throw - this is optional
      }
    }

    // Option 2: If you're using Socket.io in your backend
    // You would emit an event here
    // io.emit('new_message', notification);

    // Option 3: Store in a "pending notifications" collection
    // for clients to poll when they connect
    
  } catch (error) {
    console.error('❌ Error notifying clients:', error);
    // Don't throw - notification is optional
  }
};
