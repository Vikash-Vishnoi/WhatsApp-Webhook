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
  category: {
    type: String,
    enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
    default: 'MARKETING'
  },
  language: {
    type: String,
    default: 'en'
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'paused', 'disabled', 'in_appeal'],
    default: 'draft'
  },
  whatsappTemplateId: {
    type: String,
    default: null
  },
  whatsappStatus: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL', 'PENDING_DELETION', null],
    default: null
  },
  
  // Template Quality Score
  qualityScore: {
    type: String,
    enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN', null],
    default: null
  },
  
  // Quality History
  qualityHistory: [{
    score: {
      type: String,
      enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    reason: String
  }],
  
  // Template Status Update Info
  statusUpdateInfo: {
    lastStatusChange: Date,
    statusChangeReason: String,
    pausedAt: Date,
    pauseReason: String
  },
  
  // Template Namespace
  namespace: {
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
templateSchema.index({ businessId: 1, name: 1 });

/**
 * Update template quality score
 */
templateSchema.methods.updateQualityScore = async function(qualityData) {
  // Add to history
  this.qualityHistory.push({
    score: qualityData.score,
    timestamp: new Date(),
    reason: qualityData.reason
  });
  
  // Update current score
  this.qualityScore = qualityData.score;
  
  // Keep only last 30 history entries
  if (this.qualityHistory.length > 30) {
    this.qualityHistory = this.qualityHistory.slice(-30);
  }
  
  await this.save();
};

/**
 * Update template status
 */
templateSchema.methods.updateStatus = async function(statusData) {
  if (statusData.whatsappStatus) {
    this.whatsappStatus = statusData.whatsappStatus;
    
    // Sync local status
    if (statusData.whatsappStatus === 'APPROVED') {
      this.status = 'approved';
      this.approvedAt = new Date();
    } else if (statusData.whatsappStatus === 'REJECTED') {
      this.status = 'rejected';
      this.rejectionReason = statusData.reason;
      this.rejectedAt = new Date();
    } else if (statusData.whatsappStatus === 'PAUSED') {
      this.status = 'paused';
      this.pausedAt = new Date();
      this.statusUpdateInfo.pausedAt = new Date();
      this.statusUpdateInfo.pauseReason = statusData.reason;
    } else if (statusData.whatsappStatus === 'DISABLED') {
      this.status = 'disabled';
    }
  }
  
  this.statusUpdateInfo.lastStatusChange = new Date();
  this.statusUpdateInfo.statusChangeReason = statusData.reason;
  
  await this.save();
};

/**
 * Get template health statistics for a business
 */
templateSchema.statics.getHealthStats = async function(businessId) {
  const stats = await this.aggregate([
    { $match: { businessId: mongoose.Types.ObjectId(businessId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        approved: {
          $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
        },
        rejected: {
          $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
        },
        paused: {
          $sum: { $cond: [{ $eq: ['$status', 'paused'] }, 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        }
      }
    }
  ]);
  
  return stats.length > 0 ? stats[0] : {
    total: 0,
    approved: 0,
    rejected: 0,
    paused: 0,
    pending: 0
  };
};

const Template = mongoose.model('Template', templateSchema);

module.exports = Template;
