const mongoose = require('mongoose');

/**
 * Minimal AlertLog Model for Webhook Service
 * Only includes fields needed for creating account alerts
 */

const alertLogSchema = new mongoose.Schema({
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
  alertType: {
    type: String,
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  whatsappData: {
    phoneNumberId: String,
    displayPhoneNumber: String,
    currentRating: {
      type: String,
      enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN']
    },
    previousRating: {
      type: String,
      enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN']
    },
    event: String,
    rawData: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['UNREAD', 'READ', 'ARCHIVED'],
    default: 'UNREAD',
    index: true
  }
}, {
  timestamps: true
});

alertLogSchema.index({ businessId: 1, createdAt: -1 });
alertLogSchema.index({ userId: 1, status: 1 });

const AlertLog = mongoose.model('AlertLog', alertLogSchema);

module.exports = AlertLog;
