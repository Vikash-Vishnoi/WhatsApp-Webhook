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
    status: 'active',
    isDeleted: false
  });
};

const Business = mongoose.model('Business', businessSchema);

module.exports = Business;
