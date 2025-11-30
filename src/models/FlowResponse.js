const mongoose = require('mongoose');

/**
 * Minimal FlowResponse Model for Webhook Service
 * Only includes fields needed for flow response processing
 */

const flowResponseSchema = new mongoose.Schema({
  flow: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Flow',
    required: true,
    index: true
  },
  flowId: {
    type: String,
    required: true,
    index: true
  },
  user: {
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
  contact: {
    phoneNumber: {
      type: String,
      required: true,
      index: true
    },
    name: String,
    profilePic: String
  },
  responseData: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  flowToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['initiated', 'in_progress', 'completed', 'abandoned', 'expired'],
    default: 'initiated',
    index: true
  },
  startedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  completedAt: Date,
  expiresAt: {
    type: Date
  },
  messageId: {
    type: String,
    index: true
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  rawWebhookData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true,
  suppressReservedKeysWarning: true
});

flowResponseSchema.index({ flow: 1, status: 1 });
flowResponseSchema.index({ user: 1, startedAt: -1 });
flowResponseSchema.index({ 'contact.phoneNumber': 1, startedAt: -1 });
flowResponseSchema.index({ status: 1, expiresAt: 1 });

/**
 * Find flow response by token
 */
flowResponseSchema.statics.findByToken = async function(token) {
  return await this.findOne({ 
    flowToken: token,
    status: { $in: ['initiated', 'in_progress'] }
  }).populate('flow');
};

/**
 * Add response field
 */
flowResponseSchema.methods.addResponse = function(key, value) {
  if (!this.responseData) {
    this.responseData = new Map();
  }
  this.responseData.set(key, value);
};

/**
 * Mark as completed
 */
flowResponseSchema.methods.markCompleted = async function() {
  this.status = 'completed';
  this.completedAt = new Date();
  await this.save();
  
  // Update flow analytics if flow is available
  const Flow = mongoose.model('Flow');
  const flow = await Flow.findById(this.flow);
  if (flow && flow.updateAnalytics) {
    await flow.updateAnalytics(true);
  }
  
  return this;
};

/**
 * Mark as abandoned
 */
flowResponseSchema.methods.markAbandoned = async function() {
  this.status = 'abandoned';
  await this.save();
  
  // Update flow analytics if flow is available
  const Flow = mongoose.model('Flow');
  const flow = await Flow.findById(this.flow);
  if (flow && flow.updateAnalytics) {
    await flow.updateAnalytics(false, null);
  }
  
  return this;
};

/**
 * Get response as plain object
 */
flowResponseSchema.methods.getResponseObject = function() {
  return {
    flowId: this.flowId,
    contact: this.contact,
    status: this.status,
    data: this.responseData ? Object.fromEntries(this.responseData) : {},
    startedAt: this.startedAt,
    completedAt: this.completedAt
  };
};

/**
 * Clean up expired responses
 */
flowResponseSchema.statics.cleanupExpired = async function() {
  const now = new Date();
  
  const result = await this.updateMany(
    {
      status: { $in: ['initiated', 'in_progress'] },
      expiresAt: { $lt: now }
    },
    {
      $set: { status: 'expired' }
    }
  );

  return result.modifiedCount;
};

// Set expiry date on creation
flowResponseSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt) {
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 24);
    this.expiresAt = expiryDate;
  }
  next();
});

const FlowResponse = mongoose.model('FlowResponse', flowResponseSchema);

module.exports = FlowResponse;
