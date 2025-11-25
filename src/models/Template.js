const mongoose = require('mongoose');

/**
 * Minimal Template Model for Webhook Service
 * Only includes fields needed for template status updates
 */

const templateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'paused'],
    default: 'draft'
  },
  whatsappTemplateId: {
    type: String,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  pausedAt: {
    type: Date,
    default: null
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

templateSchema.index({ businessId: 1, whatsappTemplateId: 1 });

const Template = mongoose.model('Template', templateSchema);

module.exports = Template;
