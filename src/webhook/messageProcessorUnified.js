/**
 * WhatsApp Message Processor - Unified Model
 * 
 * Updated to save messages directly to conversation's messages array
 */

const { saveMessageToConversation, findOrCreateConversation } = require('../database/mongodbUnified');
const { notifyClients } = require('../services/notifier');

exports.processIncomingMessage = async (webhookData) => {
  try {
    console.log('🔍 Processing webhook data...');
    
    // Extract message data from webhook
    const messageData = extractMessageData(webhookData);
    
    if (!messageData) {
      console.log('⚠️  No message data found in webhook');
      return;
    }

    console.log('📱 Message from:', messageData.from);
    console.log('📝 Message type:', messageData.type);
    console.log('💬 Message content:', messageData.text?.body || messageData.type);

    // Extract contact info
    const contactInfo = webhookData.contacts?.[0];
    const contactName = contactInfo?.profile?.name || messageData.from;
    
    console.log('👤 Contact name:', contactName);

    // Admin user ID for webhook-created conversations
    const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '68f9490fef1e28c3cb8a9f8b';
    const businessPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '897748750080236';

    // Find or create conversation
    console.log('🔍 Finding/creating conversation...');
    const conversation = await findOrCreateConversation({
      phoneNumber: messageData.from,
      name: contactName,
      userId: ADMIN_USER_ID,
      lastMessageText: messageData.text?.body || `[${messageData.type}]`,
      lastMessageTimestamp: new Date(parseInt(messageData.timestamp) * 1000)
    });

    console.log('💾 Conversation ID:', conversation._id);

    // Prepare message document for embedding
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

    // Save message directly to conversation's messages array
    console.log('💾 Adding message to conversation...');
    const result = await saveMessageToConversation(conversation._id, messageDoc);
    
    if (result.duplicate) {
      console.log('⚠️  Duplicate message, skipping notification');
      return result;
    }

    console.log('✅ Message saved successfully:', result.messageId);

    // Notify connected clients (real-time update)
    console.log('📡 Notifying connected clients...');
    await notifyClients({
      type: 'new_message',
      conversationId: conversation._id,
      message: {
        ...messageDoc,
        _id: result.messageId
      }
    });

    console.log('✅ Message processing complete!');
    
    return result;
  } catch (error) {
    console.error('❌ Error processing message:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
};

/**
 * Build message content object based on message type
 */
function buildMessageContent(messageData) {
  const content = {
    text: messageData.text?.body || ''
  };

  // Handle different message types
  switch (messageData.type) {
    case 'text':
      // Already have text
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
      // Handle button or list reply
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

  // Add context (reply info) if present
  if (messageData.context) {
    content.context = {
      messageId: messageData.context.id,
      from: messageData.context.from
    };
  }

  return content;
}

/**
 * Extract relevant message data from webhook payload
 */
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

/**
 * Process status update webhooks (delivered, read, etc.)
 */
exports.processStatusUpdate = async (webhookData) => {
  try {
    const { updateMessageStatus } = require('../database/mongodbUnified');
    
    const statuses = webhookData.statuses;
    if (!statuses || statuses.length === 0) {
      console.log('⚠️  No status updates in webhook');
      return;
    }

    for (const status of statuses) {
      console.log(`📊 Status update: ${status.id} → ${status.status}`);
      
      await updateMessageStatus(
        status.id,
        status.status,
        status.timestamp ? new Date(parseInt(status.timestamp) * 1000) : new Date()
      );
    }

    console.log('✅ Status updates processed');
  } catch (error) {
    console.error('❌ Error processing status update:', error);
    throw error;
  }
};

module.exports = { 
  processIncomingMessage: exports.processIncomingMessage,
  processStatusUpdate: exports.processStatusUpdate
};
