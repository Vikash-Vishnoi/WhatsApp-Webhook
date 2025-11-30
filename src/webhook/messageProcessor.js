const { saveMessageToConversation, findOrCreateConversation } = require('../database/mongodb');
const { notifyClients } = require('../services/notifier');

// ✅ MULTI-BUSINESS: Import business cache for routing
const businessCache = require('../utils/businessCache');

exports.processIncomingMessage = async (webhookData) => {
  try {
    console.log('🔍 Processing webhook data...');
    
    const messageData = extractMessageData(webhookData);
    
    if (!messageData) {
      console.log('⚠️  No message data found in webhook');
      return;
    }

    console.log('📱 Message from:', messageData.from);
    console.log('📝 Message type:', messageData.type);
    console.log('💬 Message content:', messageData.text?.body || messageData.type);

    const contactInfo = webhookData.contacts?.[0];
    const contactName = contactInfo?.profile?.name || messageData.from;
    
    console.log('👤 Contact name:', contactName);

    // ✅ MULTI-BUSINESS: Route webhook to correct business by phoneNumberId
    const businessPhoneId = webhookData.metadata?.phone_number_id || webhookData.metadata?.display_phone_number;
    
    if (!businessPhoneId) {
      console.error('❌ No phone_number_id in webhook metadata');
      throw new Error('Missing phone_number_id in webhook');
    }
    
    console.log('🔍 Finding business for phone number:', businessPhoneId);
    const business = await businessCache.getByPhoneNumberId(businessPhoneId);
    
    if (!business) {
      console.error('❌ No business found for phone number:', businessPhoneId);
      throw new Error(`No business configured for phone number: ${businessPhoneId}`);
    }
    
    console.log('✅ Routing webhook to business:', business.name);
    
    // Use business owner as the user for conversation assignment
    const businessOwnerId = business.owner.toString();

    console.log('🔍 Finding/creating conversation...');
    const conversation = await findOrCreateConversation({
      phoneNumber: messageData.from,
      name: contactName,
      userId: businessOwnerId,  // ✅ MULTI-BUSINESS: Use business owner
      businessId: business._id,  // ✅ MULTI-BUSINESS: Associate with business
      lastMessageText: messageData.text?.body || `[${messageData.type}]`,
      lastMessageTimestamp: new Date(parseInt(messageData.timestamp) * 1000)
    });

    console.log('💾 Conversation ID:', conversation._id);

    // ✅ SPECIAL HANDLING FOR REACTIONS - Add to existing message instead of creating new one
    if (messageData.type === 'reaction') {
      console.log('😊 Processing reaction...');
      console.log('   Reaction emoji:', messageData.reaction?.emoji);
      console.log('   Target message ID:', messageData.reaction?.message_id);
      
      const { addReactionToMessage } = require('../database/mongodb');
      const result = await addReactionToMessage(
        conversation._id,
        messageData.reaction?.message_id,
        {
          from: messageData.from,
          emoji: messageData.reaction?.emoji,
          timestamp: new Date(parseInt(messageData.timestamp) * 1000)
        }
      );
      
      if (result.success) {
        console.log('✅ Reaction added to message');
        
        // Notify clients about the reaction
        console.log('📡 Notifying connected clients about reaction...');
        await notifyClients({
          type: 'message_reaction',
          conversationId: conversation._id,
          messageId: result.messageId,
          reaction: {
            from: messageData.from,
            emoji: messageData.reaction?.emoji,
            timestamp: new Date(parseInt(messageData.timestamp) * 1000)
          }
        });
        
        return result;
      } else {
        console.warn('⚠️  Could not add reaction, message not found. Creating as new message...');
        // Fall through to create as regular message
      }
    }

    const messageDoc = {
      whatsappMessageId: messageData.id,
      from: messageData.from,
      to: business.whatsappConfig.phoneNumberId,  // ✅ MULTI-BUSINESS: Use business phone
      direction: 'incoming',
      type: messageData.type,
      content: buildMessageContent(messageData),
      timestamp: new Date(parseInt(messageData.timestamp) * 1000),
      status: 'delivered',
      businessId: business._id  // ✅ MULTI-BUSINESS: Track business
    };

    console.log('💾 Adding message to conversation...');
    const result = await saveMessageToConversation(conversation._id, messageDoc);
    
    if (result.duplicate) {
      console.log('⚠️  Duplicate message, skipping notification');
      return result;
    }

    console.log('✅ Message saved successfully:', result.messageId);

    console.log('📡 Notifying connected clients...');
    await notifyClients({
      type: 'new_message',
      conversationId: conversation._id,
      message: {
        ...messageDoc,
        _id: result.messageId
      }
    });

    // ✅ FEATURE: Push Notification for new incoming message
    console.log('🔔 Sending push notification...');
    await notifyClients({
      type: 'notification:new_message',
      title: contactName || messageData.from,
      body: getMessagePreview(messageDoc),
      data: {
        conversationId: conversation._id,
        messageId: result.messageId,
        contactName: contactName,
        contactPhone: messageData.from,
        messageType: messageData.type,
        timestamp: messageDoc.timestamp,
        businessId: business._id  // ✅ MULTI-BUSINESS: Include business context
      },
      userId: businessOwnerId,  // ✅ MULTI-BUSINESS: Notify business owner
      badge: 1
    });

    console.log('✅ Message processing complete!');
    
    return result;
  } catch (error) {
    console.error('❌ Error processing message:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
};

function buildMessageContent(messageData) {
  const content = {
    text: messageData.text?.body || ''
  };

  switch (messageData.type) {
    case 'text':
      break;

    case 'image':
      content.mediaUrl = messageData.image?.link;
      content.mediaId = messageData.image?.id;
      content.mediaType = 'image';
      content.mimeType = messageData.image?.mime_type;
      content.caption = messageData.image?.caption;
      break;

    case 'video':
      content.mediaUrl = messageData.video?.link;
      content.mediaId = messageData.video?.id;
      content.mediaType = 'video';
      content.mimeType = messageData.video?.mime_type;
      content.caption = messageData.video?.caption;
      break;

    case 'audio':
      content.mediaUrl = messageData.audio?.link;
      content.mediaId = messageData.audio?.id;
      content.mediaType = 'audio';
      content.mimeType = messageData.audio?.mime_type;
      break;

    case 'document':
      content.mediaUrl = messageData.document?.link;
      content.mediaId = messageData.document?.id;
      content.mediaType = 'document';
      content.mimeType = messageData.document?.mime_type;
      content.filename = messageData.document?.filename;
      content.caption = messageData.document?.caption;
      break;

    case 'sticker':
      content.mediaUrl = messageData.sticker?.link;
      content.mediaId = messageData.sticker?.id;
      content.mediaType = 'sticker';
      content.mimeType = messageData.sticker?.mime_type;
      break;

    case 'location':
      content.location = {
        latitude: messageData.location?.latitude,
        longitude: messageData.location?.longitude,
        name: messageData.location?.name,
        address: messageData.location?.address
      };
      content.text = `📍 ${messageData.location?.name || 'Location'}`;
      break;

    case 'contacts':
      content.contacts = messageData.contacts;
      content.text = `👤 Contact: ${messageData.contacts?.[0]?.name?.formatted_name || 'Unknown'}`;
      break;

    case 'interactive':
      if (messageData.interactive?.type === 'button_reply') {
        content.interactive = {
          type: 'button',
          buttonReply: {
            id: messageData.interactive.button_reply?.id,
            title: messageData.interactive.button_reply?.title
          }
        };
        content.text = messageData.interactive.button_reply?.title || '[Button Reply]';
      } else if (messageData.interactive?.type === 'list_reply') {
        content.interactive = {
          type: 'list',
          listReply: {
            id: messageData.interactive.list_reply?.id,
            title: messageData.interactive.list_reply?.title,
            description: messageData.interactive.list_reply?.description
          }
        };
        content.text = messageData.interactive.list_reply?.title || '[List Reply]';
      }
      break;

    case 'reaction':
      content.reaction = {
        messageId: messageData.reaction?.message_id,
        emoji: messageData.reaction?.emoji
      };
      content.text = `${messageData.reaction?.emoji || '❤️'} Reacted to message`;
      break;

    default:
      content.text = `[${messageData.type}]`;
  }

  if (messageData.context) {
    content.context = {
      messageId: messageData.context.id,
      from: messageData.context.from
    };
  }

  return content;
}

/**
 * Get message preview text for notification
 */
function getMessagePreview(message) {
  const maxLength = 100;

  switch (message.type) {
    case 'text':
      const text = message.content.text || '';
      return text.length > maxLength 
        ? text.substring(0, maxLength) + '...' 
        : text;

    case 'image':
      return message.content.caption 
        ? `📷 Image: ${message.content.caption}` 
        : '📷 Image';

    case 'video':
      return message.content.caption 
        ? `🎥 Video: ${message.content.caption}` 
        : '🎥 Video';

    case 'audio':
      return '🎤 Audio message';

    case 'document':
      return `📄 Document: ${message.content.filename || 'file'}`;

    case 'sticker':
      return '😊 Sticker';

    case 'location':
      return `📍 Location: ${message.content.location?.name || 'Shared location'}`;

    case 'contacts':
      return `👤 Contact: ${message.content.contacts?.[0]?.name?.formatted_name || 'Contact'}`;

    case 'interactive':
      if (message.content.interactive?.type === 'button') {
        return `🔘 ${message.content.text || 'Button reply'}`;
      } else if (message.content.interactive?.type === 'list') {
        return `📋 ${message.content.text || 'List reply'}`;
      }
      return 'Interactive message';

    default:
      return `[${message.type}]`;
  }
}

function extractMessageData(webhookData) {
  const message = webhookData.messages?.[0];
  
  if (!message) {
    console.log('⚠️  No messages array in webhook data');
    return null;
  }

  return {
    from: message.from,
    timestamp: message.timestamp,
    id: message.id,
    type: message.type,
    text: message.text,
    image: message.image,
    video: message.video,
    audio: message.audio,
    document: message.document,
    sticker: message.sticker,
    location: message.location,
    contacts: message.contacts,
    interactive: message.interactive,
    reaction: message.reaction,
    context: message.context
  };
}

exports.processStatusUpdate = async (webhookData) => {
  try {
    const { updateMessageStatus, updateCampaignRecipientStatus } = require('../database/mongodb');
    const { notifyClients } = require('../services/notifier');
    
    const statuses = webhookData.statuses;
    if (!statuses || statuses.length === 0) {
      console.log('⚠️  No status updates in webhook');
      return;
    }

    for (const status of statuses) {
      console.log(`📊 Status update: ${status.id} → ${status.status}`);
      
      const statusTimestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000) : new Date();
      
      // Update conversation message status
      const result = await updateMessageStatus(
        status.id,
        status.status,
        statusTimestamp
      );
      
      // ✅ FEATURE: Read Receipts - Also update campaign recipient status if this is a campaign message
      await updateCampaignRecipientStatus(
        status.id,
        status.status,
        statusTimestamp
      );
      
      // ✅ FEATURE: Read Receipts - Notify clients when message status changes
      if (result && (status.status === 'delivered' || status.status === 'read' || status.status === 'sent')) {
        console.log(`📡 Notifying clients about ${status.status} status...`);
        await notifyClients({
          type: 'message_status_update',
          conversationId: result.conversationId,
          messageId: result.messageId,
          whatsappMessageId: status.id,
          status: status.status,
          timestamp: statusTimestamp,
          recipientId: status.recipient_id
        });
      }
    }

    console.log('✅ Status updates processed');
  } catch (error) {
    console.error('❌ Error processing status update:', error);
    throw error;
  }
};

/**
 * ✅ FEATURE: Profile Updates Webhook
 * Process WhatsApp profile changes (name, photo, about)
 * Webhook field: 'contacts' with profile_update event
 */
exports.processProfileUpdate = async (webhookData) => {
  try {
    const { updateContactProfile } = require('../database/mongodb');
    const { notifyClients } = require('../services/notifier');
    
    const contacts = webhookData.contacts;
    if (!contacts || contacts.length === 0) {
      console.log('⚠️  No contacts data in webhook');
      return;
    }

    for (const contact of contacts) {
      console.log('👤 Profile update detected:');
      console.log('   Phone:', contact.wa_id);
      console.log('   Name:', contact.profile?.name);

      const profileData = {
        phoneNumber: contact.wa_id,
        name: contact.profile?.name || contact.wa_id,
        profilePhoto: contact.profile?.photo_url || null,
        about: contact.profile?.about || null,
        updatedAt: new Date()
      };

      console.log('💾 Updating contact profile in database...');
      const result = await updateContactProfile(profileData);

      if (result.success) {
        console.log('✅ Contact profile updated:', result.conversationId);
        
        // Notify clients about profile change
        console.log('📡 Notifying clients about profile update...');
        await notifyClients({
          type: 'contact_profile_update',
          conversationId: result.conversationId,
          contact: {
            phoneNumber: profileData.phoneNumber,
            name: profileData.name,
            profilePhoto: profileData.profilePhoto,
            about: profileData.about
          },
          changes: result.changes || []
        });
      } else {
        console.warn('⚠️  Could not update profile, conversation not found');
      }
    }

    console.log('✅ Profile updates processed');
  } catch (error) {
    console.error('❌ Error processing profile update:', error);
    throw error;
  }
};

/**
 * Process template status updates
 */
exports.processTemplateStatusUpdate = async (statusUpdate, business, requestId) => {
  try {
    const logger = require('../utils/logger');
    const Template = require('../models/Template');
    
    logger.info('Processing template status update', {
      requestId,
      event: statusUpdate.event,
      templateName: statusUpdate.message_template_name,
      businessId: business._id.toString()
    });

    const template = await Template.findOne({
      businessId: business._id,
      whatsappTemplateId: statusUpdate.message_template_id
    });

    if (template) {
      const previousStatus = template.status;
      
      switch (statusUpdate.event) {
        case 'APPROVED':
          template.status = 'approved';
          template.approvedAt = new Date();
          break;
        case 'REJECTED':
          template.status = 'rejected';
          template.rejectionReason = statusUpdate.reason;
          template.rejectedAt = new Date();
          break;
        case 'PENDING':
          template.status = 'pending';
          break;
        case 'PAUSED':
        case 'DISABLED':
          template.status = 'paused';
          template.pausedAt = new Date();
          break;
      }

      await template.save();
      
      logger.info('Template status updated', {
        requestId,
        templateId: template._id.toString(),
        previousStatus,
        newStatus: template.status
      });
    }
  } catch (error) {
    console.error('❌ Error processing template status update:', error);
  }
};

/**
 * Process account alerts
 */
exports.processAccountAlert = async (change, value, business, requestId) => {
  try {
    const logger = require('../utils/logger');
    const AlertLog = require('../models/AlertLog');
    const Business = require('../models/Business');
    
    logger.info('Processing account alert', {
      requestId,
      field: change.field,
      event: value.event,
      businessId: business._id.toString()
    });

    let severity = 'MEDIUM';
    let alertType = 'ACCOUNT_ALERT';
    let message = 'Account alert received';

    if (change.field === 'phone_number_quality_update') {
      const currentRating = value.current_limit || 'UNKNOWN';
      
      if (currentRating === 'RED' || value.event === 'FLAGGED') {
        severity = 'CRITICAL';
        alertType = 'QUALITY_RATING_RED';
        message = `Phone number quality rating is RED. Immediate action required.`;
      } else if (currentRating === 'YELLOW') {
        severity = 'HIGH';
        alertType = 'QUALITY_RATING_YELLOW';
        message = `Phone number quality rating decreased to YELLOW.`;
      }

      // Update Business phone quality
      await business.updatePhoneQuality({
        qualityRating: currentRating,
        messagingLimitTier: value.messaging_limit_tier,
        currentLimit: value.current_limit
      });
      
      await business.save();
    }

    // Create alert log
    await AlertLog.create({
      businessId: business._id,
      userId: business.owner,
      alertType,
      severity,
      title: alertType.replace(/_/g, ' '),
      message,
      whatsappData: {
        phoneNumberId: value.phone_number_id,
        displayPhoneNumber: value.display_phone_number,
        currentRating: value.current_limit,
        previousRating: value.previous_limit,
        event: value.event,
        rawData: value
      },
      status: 'UNREAD'
    });

    logger.info('Account alert processed', {
      requestId,
      alertType,
      severity
    });
  } catch (error) {
    console.error('❌ Error processing account alert:', error);
  }
};

/**
 * Process flow responses
 */
exports.processFlowResponse = async (message, metadata, business, requestId) => {
  try {
    const logger = require('../utils/logger');
    const FlowResponse = require('../models/FlowResponse');
    const Conversation = require('../models/Conversation');
    
    logger.info('Processing flow response', {
      requestId,
      messageId: message.id,
      businessId: business._id.toString()
    });

    const nfmReply = message.interactive?.nfm_reply;
    if (!nfmReply) return;

    const { name, body, response_json } = nfmReply;

    let responseData = {};
    try {
      responseData = response_json ? JSON.parse(response_json) : JSON.parse(body);
    } catch (e) {
      responseData = { raw_body: body };
    }

    const flowToken = responseData.flow_token || 
                     message.interactive.flow_token || 
                     message.context?.flow_token;

    if (!flowToken) return;

    const flowResponse = await FlowResponse.findByToken(flowToken);
    if (!flowResponse) return;

    const phoneNormalized = Conversation.normalizePhone(message.from);
    flowResponse.contact.phoneNumber = phoneNormalized;

    const formData = responseData.data || 
                    responseData.screen_0_TextInput_0 || 
                    responseData;

    if (typeof formData === 'object') {
      Object.entries(formData).forEach(([key, value]) => {
        flowResponse.addResponse(key, value);
      });
    }

    if (name === 'complete' || name === 'COMPLETE') {
      await flowResponse.markCompleted();
    } else {
      flowResponse.status = 'in_progress';
    }

    flowResponse.rawWebhookData = {
      messageId: message.id,
      timestamp: message.timestamp,
      interactive: message.interactive,
      nfmReply
    };

    await flowResponse.save();

    logger.info('Flow response processed', {
      requestId,
      flowResponseId: flowResponse._id.toString(),
      status: flowResponse.status
    });
  } catch (error) {
    console.error('❌ Error processing flow response:', error);
  }
};

/**
 * Process template quality updates
 */
exports.processTemplateQualityUpdate = async (webhookData, business, requestId) => {
  try {
    const logger = require('../utils/logger');
    const Template = require('../models/Template');
    
    logger.info('Processing template quality update', {
      requestId,
      templateId: webhookData.message_template_id,
      businessId: business._id.toString()
    });

    const template = await Template.findOne({
      businessId: business._id,
      whatsappTemplateId: webhookData.message_template_id
    });

    if (template) {
      const previousScore = template.qualityScore?.score;
      const previousRating = template.qualityScore?.rating;
      
      // Add to history
      if (template.qualityScore.score !== null) {
        template.qualityScore.history.push({
          score: template.qualityScore.score,
          rating: template.qualityScore.rating,
          reasons: template.qualityScore.reasons || [],
          updatedAt: new Date()
        });
      }
      
      // Update current quality score
      template.qualityScore = {
        score: webhookData.quality_score || webhookData.score,
        rating: webhookData.quality_rating || webhookData.rating || 'UNKNOWN',
        reasons: webhookData.quality_reasons || webhookData.reasons || [],
        lastUpdatedAt: new Date(),
        history: template.qualityScore.history || []
      };

      await template.save();
      
      logger.info('Template quality updated', {
        requestId,
        templateId: template._id.toString(),
        previousScore,
        newScore: template.qualityScore.score,
        previousRating,
        newRating: template.qualityScore.rating
      });
      
      // Create alert if quality is low
      if (template.qualityScore.rating === 'LOW') {
        const AlertLog = require('../models/AlertLog');
        await AlertLog.create({
          businessId: business._id,
          userId: business.owner,
          alertType: 'TEMPLATE_QUALITY_LOW',
          severity: 'HIGH',
          title: 'Template Quality Alert',
          message: `Template "${template.name}" has low quality score (${template.qualityScore.score}/100)`,
          whatsappData: webhookData,
          status: 'UNREAD'
        });
      }
    }
  } catch (error) {
    console.error('❌ Error processing template quality update:', error);
  }
};

/**
 * Process business capability updates
 */
exports.processBusinessCapabilityUpdate = async (webhookData, business, requestId) => {
  try {
    const logger = require('../utils/logger');
    const BusinessCapability = require('../models/BusinessCapability');
    
    logger.info('Processing business capability update', {
      requestId,
      businessId: business._id.toString()
    });

    let capability = await BusinessCapability.findOne({
      businessId: business._id,
      wabaId: webhookData.waba_id || business.whatsappConfig.wabaId
    });

    if (!capability) {
      capability = new BusinessCapability({
        businessId: business._id,
        wabaId: webhookData.waba_id || business.whatsappConfig.wabaId,
        capabilities: [],
        accountStatus: 'ACTIVE'
      });
    }

    capability.updateFromWebhook(webhookData);
    await capability.save();

    logger.info('Business capability updated', {
      requestId,
      capabilityId: capability._id.toString(),
      accountStatus: capability.accountStatus,
      hasRestrictions: capability.hasRestrictions
    });

    // Create alert if there are new restrictions
    if (capability.hasRestrictions && capability.restrictionCount > 0) {
      const AlertLog = require('../models/AlertLog');
      await AlertLog.create({
        businessId: business._id,
        userId: business.owner,
        alertType: 'CAPABILITY_RESTRICTED',
        severity: capability.accountStatus === 'DISABLED' ? 'CRITICAL' : 'HIGH',
        title: 'Business Capability Restricted',
        message: `Your WhatsApp Business account has ${capability.restrictionCount} restriction(s)`,
        whatsappData: webhookData,
        status: 'UNREAD'
      });
    }
  } catch (error) {
    console.error('❌ Error processing business capability update:', error);
  }
};

/**
 * Process message echoes (messages sent from other channels)
 */
exports.processMessageEcho = async (webhookData, business, requestId) => {
  try {
    const logger = require('../utils/logger');
    const MessageEcho = require('../models/MessageEcho');
    const { findOrCreateConversation } = require('../database/mongodb');
    
    const message = webhookData.messages?.[0];
    if (!message) return;

    logger.info('Processing message echo', {
      requestId,
      messageId: message.id,
      businessId: business._id.toString()
    });

    // Find or create conversation
    const conversation = await findOrCreateConversation({
      phoneNumber: message.to,
      name: message.to,
      userId: business.owner.toString(),
      businessId: business._id,
      lastMessageText: message.text?.body || `[${message.type}]`,
      lastMessageTimestamp: new Date(parseInt(message.timestamp) * 1000)
    });

    // Create message echo record
    const echo = new MessageEcho({
      businessId: business._id,
      conversationId: conversation._id,
      whatsappMessageId: message.id,
      from: message.from,
      to: message.to,
      sourceChannel: webhookData.source_channel || 'UNKNOWN',
      sourceDevice: webhookData.source_device,
      sourceApp: webhookData.source_app,
      type: message.type,
      content: buildMessageContent(message),
      status: 'sent',
      sentAt: new Date(parseInt(message.timestamp) * 1000),
      rawWebhookData: webhookData
    });

    await echo.save();

    logger.info('Message echo saved', {
      requestId,
      echoId: echo._id.toString(),
      conversationId: conversation._id.toString()
    });

    // Notify clients about the echo
    const { notifyClients } = require('../services/notifier');
    await notifyClients({
      type: 'message_echo',
      conversationId: conversation._id,
      message: {
        _id: echo._id,
        ...echo.toObject()
      }
    });
  } catch (error) {
    console.error('❌ Error processing message echo:', error);
  }
};

/**
 * Build message content from message data (helper function)
 */
function buildMessageContent(messageData) {
  const content = {
    text: messageData.text?.body || ''
  };

  switch (messageData.type) {
    case 'text':
      break;
    case 'image':
      content.mediaUrl = messageData.image?.link;
      content.mediaId = messageData.image?.id;
      content.mediaType = 'image';
      content.mimeType = messageData.image?.mime_type;
      content.caption = messageData.image?.caption;
      break;
    case 'video':
      content.mediaUrl = messageData.video?.link;
      content.mediaId = messageData.video?.id;
      content.mediaType = 'video';
      content.mimeType = messageData.video?.mime_type;
      content.caption = messageData.video?.caption;
      break;
    case 'audio':
      content.mediaUrl = messageData.audio?.link;
      content.mediaId = messageData.audio?.id;
      content.mediaType = 'audio';
      content.mimeType = messageData.audio?.mime_type;
      break;
    case 'document':
      content.mediaUrl = messageData.document?.link;
      content.mediaId = messageData.document?.id;
      content.mediaType = 'document';
      content.mimeType = messageData.document?.mime_type;
      content.filename = messageData.document?.filename;
      content.caption = messageData.document?.caption;
      break;
    default:
      content.text = `[${messageData.type}]`;
  }

  if (messageData.context) {
    content.context = {
      messageId: messageData.context.id,
      from: messageData.context.from
    };
  }

  return content;
}

/**
 * Process tracking events
 */
exports.processTrackingEvent = async (webhookData, business, requestId) => {
  try {
    const logger = require('../utils/logger');
    const TrackingEvent = require('../models/TrackingEvent');
    
    const events = webhookData.events || [webhookData];
    
    for (const eventData of events) {
      logger.info('Processing tracking event', {
        requestId,
        eventType: eventData.event_type,
        businessId: business._id.toString()
      });

      const event = new TrackingEvent({
        businessId: business._id,
        userId: business.owner,
        eventType: eventData.event_type,
        eventCategory: eventData.event_category || 'OTHER',
        contactPhone: eventData.contact_phone || eventData.phone_number,
        contactName: eventData.contact_name,
        eventData: {
          url: eventData.url,
          linkId: eventData.link_id,
          buttonId: eventData.button_id,
          buttonText: eventData.button_text,
          productId: eventData.product_id,
          catalogId: eventData.catalog_id,
          campaignName: eventData.campaign_name,
          properties: eventData.properties || {}
        },
        source: 'WEBHOOK',
        eventTimestamp: eventData.timestamp ? new Date(parseInt(eventData.timestamp) * 1000) : new Date(),
        rawWebhookData: eventData
      });

      await event.save();

      logger.info('Tracking event saved', {
        requestId,
        eventId: event._id.toString(),
        eventType: event.eventType
      });
    }
  } catch (error) {
    console.error('❌ Error processing tracking event:', error);
  }
};

/**
 * Process user preferences
 */
exports.processUserPreference = async (webhookData, business, requestId) => {
  try {
    const logger = require('../utils/logger');
    const UserPreference = require('../models/UserPreference');
    
    const phoneNumber = webhookData.phone_number || webhookData.contact_phone;
    
    logger.info('Processing user preference', {
      requestId,
      phoneNumber,
      businessId: business._id.toString()
    });

    let preference = await UserPreference.findOne({
      businessId: business._id,
      phoneNumber
    });

    if (!preference) {
      preference = new UserPreference({
        businessId: business._id,
        phoneNumber,
        contactName: webhookData.contact_name,
        optInStatus: 'UNKNOWN'
      });
    }

    preference.updateFromWebhook(webhookData);
    await preference.save();

    logger.info('User preference updated', {
      requestId,
      preferenceId: preference._id.toString(),
      optInStatus: preference.optInStatus
    });

    // If user opted out, create alert
    if (preference.optInStatus === 'OPTED_OUT') {
      const AlertLog = require('../models/AlertLog');
      await AlertLog.create({
        businessId: business._id,
        userId: business.owner,
        alertType: 'USER_OPTED_OUT',
        severity: 'MEDIUM',
        title: 'User Opted Out',
        message: `Contact ${phoneNumber} has opted out of messages`,
        whatsappData: webhookData,
        status: 'UNREAD'
      });
    }
  } catch (error) {
    console.error('❌ Error processing user preference:', error);
  }
};

module.exports = { 
  processIncomingMessage: exports.processIncomingMessage,
  processStatusUpdate: exports.processStatusUpdate,
  processProfileUpdate: exports.processProfileUpdate,
  processTemplateStatusUpdate: exports.processTemplateStatusUpdate,
  processAccountAlert: exports.processAccountAlert,
  processFlowResponse: exports.processFlowResponse,
  processTemplateQualityUpdate: exports.processTemplateQualityUpdate,
  processBusinessCapabilityUpdate: exports.processBusinessCapabilityUpdate,
  processMessageEcho: exports.processMessageEcho,
  processTrackingEvent: exports.processTrackingEvent,
  processUserPreference: exports.processUserPreference
};
