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
  completedAt: Date,
  rawWebhookData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

/**
 * Find flow response by token
 */
flowResponseSchema.statics.findByToken = async function(token) {
  return await this.findOne({ flowToken: token });
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
};

const FlowResponse = mongoose.model('FlowResponse', flowResponseSchema);

module.exports = FlowResponse;
