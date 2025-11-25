const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'BACKEND_URL';

exports.notifyClients = async (notification) => {
  try {
    console.log('� Message notification logged (real-time updates handled by backend Socket.io)');
  } catch (error) {
    console.error('❌ Error notifying clients:', error);
  }
};
