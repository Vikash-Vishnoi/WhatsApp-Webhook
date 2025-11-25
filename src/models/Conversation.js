const mongoose = require('mongoose');

/**
 * Minimal Conversation Model for Webhook Service
 * Only includes the normalizePhone utility method
 */

const conversationSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

/**
 * Normalize phone number
 */
conversationSchema.statics.normalizePhone = function(phoneNumber) {
  const normalized = phoneNumber.replace(/\D/g, '');
  return normalized.startsWith('91') ? normalized : `91${normalized}`;
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
