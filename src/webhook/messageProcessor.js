const { saveMessageToConversation, findOrCreateConversation } = require('../database/mongodb');
const { notifyClients } = require('../services/notifier');

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

    const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '68f9490fef1e28c3cb8a9f8b';
    const businessPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '897748750080236';

    console.log('🔍 Finding/creating conversation...');
    const conversation = await findOrCreateConversation({
      phoneNumber: messageData.from,
      name: contactName,
      userId: ADMIN_USER_ID,
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
      to: businessPhoneId,
      direction: 'incoming',
      type: messageData.type,
      content: buildMessageContent(messageData),
      timestamp: new Date(parseInt(messageData.timestamp) * 1000),
      status: 'delivered'
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
        timestamp: messageDoc.timestamp
      },
      userId: ADMIN_USER_ID,
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

module.exports = { 
  processIncomingMessage: exports.processIncomingMessage,
  processStatusUpdate: exports.processStatusUpdate,
  processProfileUpdate: exports.processProfileUpdate
};
