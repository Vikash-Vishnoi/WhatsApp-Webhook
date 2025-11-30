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
    enum: [
      'ACCOUNT_UPDATE',
      'ACCOUNT_WARNING',
      'MESSAGE_TEMPLATE_QUALITY_UPDATE',
      'MESSAGE_TEMPLATE_STATUS_UPDATE',
      'PHONE_NUMBER_QUALITY_UPDATE',
      'PHONE_NUMBER_NAME_UPDATE',
      'POLICY_ENFORCEMENT',
      'QUALITY_SCORE',
      'TIER_CHANGE',
      'LIMIT_CHANGE',
      'UNKNOWN'
    ],
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
    qualityScore: {
      type: Number,
      min: 0,
      max: 100
    },
    messagingLimitTier: {
      type: String,
      enum: ['TIER_1K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED', 'UNKNOWN']
    },
    decision: String,
    event: String,
    templateId: String,
    templateName: String,
    templateLanguage: String,
    templateCategory: String,
    reasonCode: String,
    rawData: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['UNREAD', 'READ', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED'],
    default: 'UNREAD',
    index: true
  },
  resolvedAt: Date
}, {
  timestamps: true
});

alertLogSchema.index({ businessId: 1, createdAt: -1 });
alertLogSchema.index({ userId: 1, status: 1 });
alertLogSchema.index({ userId: 1, createdAt: -1 });
alertLogSchema.index({ alertType: 1, createdAt: -1 });
alertLogSchema.index({ severity: 1, status: 1 });

/**
 * Mark alert as read
 */
alertLogSchema.methods.markAsRead = async function() {
  if (this.status === 'UNREAD') {
    this.status = 'READ';
    await this.save();
  }
};

/**
 * Mark alert as acknowledged
 */
alertLogSchema.methods.acknowledge = async function() {
  this.status = 'ACKNOWLEDGED';
  await this.save();
};

/**
 * Mark alert as resolved
 */
alertLogSchema.methods.resolve = async function() {
  this.status = 'RESOLVED';
  this.resolvedAt = new Date();
  await this.save();
};

const AlertLog = mongoose.model('AlertLog', alertLogSchema);

module.exports = AlertLog;
