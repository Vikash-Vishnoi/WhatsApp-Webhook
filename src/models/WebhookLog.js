const mongoose = require('mongoose');

/**
 * WebhookLog Model - Complete Audit Trail for WhatsApp Webhook Events
 * 
 * Logs all incoming webhook events from WhatsApp Business API for:
 * - Audit trail and compliance
 * - Processing queue management
 * - Error tracking and retry logic
 * - Debugging and troubleshooting
 * 
 * Supported Events:
 * - messages: Incoming/outgoing message events
 * - message_template_status_update: Template approval/rejection
 * - message_template_quality_update: Template quality score changes
 * - account_alerts: Account warnings and violations
 * - business_capability_update: Capability restrictions
 * - phone_number_quality_update: Quality rating changes
 * - message_echoes: Sent message confirmations
 * - flows: WhatsApp Flow completions
 * - tracking_events: Conversion tracking
 * - user_preferences: User preference updates
 */

const webhookLogSchema = new mongoose.Schema({
  // Business Reference
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },
  
  // Phone Number ID (for quick filtering)
  phoneNumberId: {
    type: String,
    required: true,
    index: true
  },
  
  // Event Type
  eventType: {
    type: String,
    enum: [
      'messages',
      'message_template_status_update',
      'message_template_quality_update',
      'account_alerts',
      'business_capability_update',
      'phone_number_quality_update',
      'message_echoes',
      'flows',
      'tracking_events',
      'user_preferences'
    ],
    required: true,
    index: true
  },
  
  // Raw Webhook Payload
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Processing Status
  processed: {
    type: Boolean,
    default: false,
    index: true
  },
  
  processingAttempts: {
    type: Number,
    default: 0
  },
  
  processingError: {
    message: String,
    stack: String,
    timestamp: Date
  },
  
  // Metadata
  messageId: String, // For message events
  templateId: String, // For template events
  flowId: String, // For flow events
  
  // Webhook Signature Verification
  signatureVerified: {
    type: Boolean,
    default: false
  },
  
  // Processing Time (for performance monitoring)
  processedAt: Date,
  processingDuration: Number, // in milliseconds
  
  // Received timestamp
  receivedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
  
}, {
  timestamps: true,
  // Auto-delete logs after 90 days (GDPR compliance)
  expireAfterSeconds: 7776000 // 90 days
});

// Compound Indexes for efficient queries
webhookLogSchema.index({ business: 1, eventType: 1, createdAt: -1 });
webhookLogSchema.index({ processed: 1, processingAttempts: 1, createdAt: 1 });
webhookLogSchema.index({ phoneNumberId: 1, eventType: 1, createdAt: -1 });

// Instance Methods

/**
 * Mark log as processed successfully
 */
webhookLogSchema.methods.markProcessed = async function() {
  this.processed = true;
  this.processedAt = new Date();
  this.processingDuration = this.processedAt - this.receivedAt;
  await this.save();
};

/**
 * Record processing error
 */
webhookLogSchema.methods.recordError = async function(error) {
  this.processingAttempts += 1;
  this.processingError = {
    message: error.message || String(error),
    stack: error.stack,
    timestamp: new Date()
  };
  
  // Mark as processed if max attempts reached (prevent infinite retries)
  if (this.processingAttempts >= 3) {
    this.processed = true;
  }
  
  await this.save();
};

// Static Methods

/**
 * Find unprocessed logs for retry
 */
webhookLogSchema.statics.findUnprocessed = async function(limit = 100) {
  return await this.find({
    processed: false,
    processingAttempts: { $lt: 3 }
  })
  .sort({ createdAt: 1 })
  .limit(limit);
};

/**
 * Get recent events by business
 */
webhookLogSchema.statics.getRecentEvents = async function(businessId, eventType = null, limit = 50) {
  const query = { business: businessId };
  if (eventType) {
    query.eventType = eventType;
  }
  
  return await this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-payload'); // Exclude large payload field
};

/**
 * Get webhook statistics
 */
webhookLogSchema.statics.getStats = async function(businessId, startDate, endDate) {
  return await this.aggregate([
    {
      $match: {
        business: mongoose.Types.ObjectId(businessId),
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        processed: {
          $sum: { $cond: ['$processed', 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $gte: ['$processingAttempts', 3] }, 1, 0] }
        },
        avgProcessingTime: {
          $avg: '$processingDuration'
        }
      }
    }
  ]);
};

const WebhookLog = mongoose.model('WebhookLog', webhookLogSchema);

module.exports = WebhookLog;
