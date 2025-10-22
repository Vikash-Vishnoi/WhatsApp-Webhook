/**
 * WhatsApp Message Processor
 * 
 * Extracts message data from webhook payload and saves to database
 */

const { saveMessage, findOrCreateConversation } = require('../database/mongodb');
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
    const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '68f927fe0837e17cb3a12024';
    const businessPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '897748750080236';

    // Find or create conversation (using backend-compatible nested schema)
    console.log('🔍 Finding/creating conversation...');
    const conversation = await findOrCreateConversation({
      phoneNumber: messageData.from,
      name: contactName,
      userId: ADMIN_USER_ID,
      lastMessageText: messageData.text?.body || `[${messageData.type}]`,
      lastMessageTimestamp: new Date(parseInt(messageData.timestamp) * 1000)
    });

    console.log('💾 Conversation ID:', conversation._id);

    // Prepare message document (backend-compatible schema with nested content)
    const messageDoc = {
      conversationId: conversation._id,
      from: messageData.from,
      to: businessPhoneId,
      userId: ADMIN_USER_ID,
      direction: 'incoming',
      type: messageData.type,
      content: {
        text: messageData.text?.body || '',
        mediaUrl: messageData.image?.link || messageData.video?.link || messageData.document?.link || null,
        caption: messageData.image?.caption || messageData.video?.caption || null
      },
      timestamp: new Date(parseInt(messageData.timestamp) * 1000),
      whatsappMessageId: messageData.id,
      status: 'delivered'
    };

    // Save message to database
    console.log('💾 Saving message to database...');
    const savedMessage = await saveMessage(messageDoc);
    console.log('✅ Message saved successfully:', savedMessage.insertedId);

    // Notify connected clients (real-time update)
    console.log('📡 Notifying connected clients...');
    await notifyClients({
      type: 'new_message',
      conversationId: conversation._id,
      message: messageDoc
    });

    console.log('✅ Message processing complete!');
    
    return savedMessage;
  } catch (error) {
    console.error('❌ Error processing message:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
};

/**
 * Extract relevant message data from webhook payload
 */
function extractMessageData(webhookData) {
  // Messages array contains the actual message
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
    location: message.location,
    context: message.context // For replies
  };
}

// Ensure the exported function is the one attached to `exports` above.
// We used `exports.processIncomingMessage = ...` earlier, so reference
// that property when building module.exports to avoid a ReferenceError.
module.exports = { processIncomingMessage: exports.processIncomingMessage };
