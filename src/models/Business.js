const mongoose = require('mongoose');

/**
 * Minimal Business Model for Webhook Service
 * Contains only fields needed for webhook processing
 */

const businessSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  whatsappConfig: {
    phoneNumberId: {
      type: String,
      required: true,
      trim: true
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: ''
    },
    wabaId: {
      type: String,
      required: true,
      trim: true
    },
    accessToken: {
      type: String,
      required: true,
      select: false
    },
    appSecret: {
      type: String,
      required: true,
      select: false
    },
    verifyToken: {
      type: String,
      required: true
    }
  },
  
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active',
    index: true
  },
  
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // WhatsApp Business Account Capabilities
  capabilities: {
    messaging: {
      type: String,
      enum: ['ENABLED', 'DISABLED', 'RESTRICTED'],
      default: 'ENABLED'
    },
    payment: {
      type: String,
      enum: ['ENABLED', 'DISABLED', 'RESTRICTED'],
      default: 'DISABLED'
    },
    businessManagement: {
      type: String,
      enum: ['ENABLED', 'DISABLED', 'RESTRICTED'],
      default: 'ENABLED'
    },
    lastUpdated: Date
  },
  
  // Phone Number Quality & Status
  phoneNumberQuality: {
    qualityScore: {
      type: String,
      enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'],
      default: 'UNKNOWN'
    },
    qualityRating: {
      type: String,
      enum: ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'],
      default: 'UNKNOWN'
    },
    messagingLimitTier: {
      type: String,
      enum: ['TIER_50', 'TIER_250', 'TIER_1K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED'],
      default: 'TIER_1K'
    },
    nameStatus: {
      type: String,
      enum: ['APPROVED', 'AVAILABLE_WITHOUT_REVIEW', 'DECLINED', 'EXPIRED', 'PENDING_REVIEW', 'NONE'],
      default: 'NONE'
    },
    qualityHistory: [{
      score: String,
      rating: String,
      tier: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      reason: String
    }],
    lastQualityUpdate: Date
  },
  
  // Business Verification & Display Name
  verification: {
    displayName: {
      type: String,
      trim: true
    },
    displayNameCertification: {
      type: String,
      enum: ['APPROVED', 'DECLINED', 'EXPIRED', 'NONE', 'PENDING'],
      default: 'NONE'
    },
    businessVerificationStatus: {
      type: String,
      enum: ['VERIFIED', 'UNVERIFIED', 'PENDING'],
      default: 'UNVERIFIED'
    },
    verifiedName: String,
    certificationDate: Date
  },
  
  // Template Health Summary
  templateHealth: {
    totalTemplates: {
      type: Number,
      default: 0
    },
    approvedTemplates: {
      type: Number,
      default: 0
    },
    rejectedTemplates: {
      type: Number,
      default: 0
    },
    pausedTemplates: {
      type: Number,
      default: 0
    },
    lastTemplateUpdate: Date
  },
  
  // Account Alerts
  alerts: [{
    alertType: {
      type: String,
      enum: [
        'TEMPLATE_QUALITY_UPDATE',
        'PHONE_NUMBER_QUALITY_UPDATE',
        'MESSAGING_LIMIT_UPDATE',
        'ACCOUNT_WARNING',
        'ACCOUNT_VIOLATION',
        'BUSINESS_CAPABILITY_UPDATE',
        'DISPLAY_NAME_UPDATE',
        'TEMPLATE_STATUS_UPDATE'
      ],
      required: true
    },
    severity: {
      type: String,
      enum: ['INFO', 'WARNING', 'CRITICAL'],
      default: 'INFO'
    },
    title: {
      type: String,
      required: true
    },
    description: String,
    metadata: mongoose.Schema.Types.Mixed,
    isRead: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date
  }],
  
  // Message Echo Settings
  messageEchoes: {
    enabled: {
      type: Boolean,
      default: true
    },
    lastEchoTimestamp: Date
  },
  
  // Analytics & Tracking
  analytics: {
    pixelId: String,
    conversionTracking: {
      enabled: {
        type: Boolean,
        default: false
      },
      events: [{
        eventName: String,
        eventId: String
      }]
    },
    lastTrackingUpdate: Date
  }
}, {
  timestamps: true
});

// Indexes
businessSchema.index({ 'whatsappConfig.phoneNumberId': 1 });
businessSchema.index({ status: 1, isDeleted: 1 });

/**
 * Find business by phone number ID
 */
businessSchema.statics.findByPhoneNumberId = async function(phoneNumberId) {
  return await this.findOne({
    'whatsappConfig.phoneNumberId': phoneNumberId,
    status: 'active'
  });
};

/**
 * Update phone number quality
 */
businessSchema.methods.updatePhoneQuality = async function(qualityData) {
  // Add to history
  this.phoneNumberQuality.qualityHistory.push({
    score: qualityData.score || this.phoneNumberQuality.qualityScore,
    rating: qualityData.rating || this.phoneNumberQuality.qualityRating,
    tier: qualityData.tier || this.phoneNumberQuality.messagingLimitTier,
    timestamp: new Date(),
    reason: qualityData.reason
  });
  
  // Update current values
  if (qualityData.score) this.phoneNumberQuality.qualityScore = qualityData.score;
  if (qualityData.rating) this.phoneNumberQuality.qualityRating = qualityData.rating;
  if (qualityData.tier) this.phoneNumberQuality.messagingLimitTier = qualityData.tier;
  if (qualityData.nameStatus) this.phoneNumberQuality.nameStatus = qualityData.nameStatus;
  
  this.phoneNumberQuality.lastQualityUpdate = new Date();
  
  // Keep only last 50 history entries
  if (this.phoneNumberQuality.qualityHistory.length > 50) {
    this.phoneNumberQuality.qualityHistory = this.phoneNumberQuality.qualityHistory.slice(-50);
  }
  
  await this.save();
};

/**
 * Update template health stats
 */
businessSchema.methods.updateTemplateHealth = async function(stats) {
  if (stats.total !== undefined) this.templateHealth.totalTemplates = stats.total;
  if (stats.approved !== undefined) this.templateHealth.approvedTemplates = stats.approved;
  if (stats.rejected !== undefined) this.templateHealth.rejectedTemplates = stats.rejected;
  if (stats.paused !== undefined) this.templateHealth.pausedTemplates = stats.paused;
  
  this.templateHealth.lastTemplateUpdate = new Date();
  await this.save();
};

/**
 * Add alert notification
 */
businessSchema.methods.addAlert = async function(alertData) {
  this.alerts.push({
    alertType: alertData.alertType,
    severity: alertData.severity || 'INFO',
    title: alertData.title,
    description: alertData.description,
    metadata: alertData.metadata,
    expiresAt: alertData.expiresAt
  });
  
  // Keep only last 100 alerts
  if (this.alerts.length > 100) {
    this.alerts = this.alerts.slice(-100);
  }
  
  await this.save();
};

const Business = mongoose.model('Business', businessSchema);

module.exports = Business;
