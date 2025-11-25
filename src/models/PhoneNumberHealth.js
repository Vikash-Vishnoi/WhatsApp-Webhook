const mongoose = require('mongoose');

/**
 * Minimal PhoneNumberHealth Model for Webhook Service
 * Only includes fields needed for quality rating updates
 */

const phoneNumberHealthSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },
  phoneNumberId: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true
  },
  qualityRating: {
    type: String,
    enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'],
    default: 'UNKNOWN'
  },
  status: {
    type: String,
    enum: ['CONNECTED', 'DISCONNECTED', 'FLAGGED', 'UNKNOWN'],
    default: 'UNKNOWN'
  },
  alerts: [{
    timestamp: Date,
    alertType: String,
    severity: String,
    message: String,
    event: String
  }],
  lastCheckedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

phoneNumberHealthSchema.index({ businessId: 1, phoneNumberId: 1 });

const PhoneNumberHealth = mongoose.model('PhoneNumberHealth', phoneNumberHealthSchema);

module.exports = PhoneNumberHealth;
