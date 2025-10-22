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
    const contactName = contactInfo?.profile?.name || 'Unknown';
    
    console.log('👤 Contact name:', contactName);

    // Find or create conversation
    console.log('🔍 Finding/creating conversation...');
    const conversation = await findOrCreateConversation({
      patientPhone: messageData.from,
      patientName: contactName,
      lastMessageText: messageData.text?.body || `[${messageData.type}]`,
      lastMessageTimestamp: new Date(parseInt(messageData.timestamp) * 1000)
    });

    console.log('💾 Conversation ID:', conversation._id);

    // Prepare message document
    const messageDoc = {
      conversationId: conversation._id,
      phoneNumber: messageData.from,
      text: messageData.text?.body || '',
      type: messageData.type,
      direction: 'incoming',
      timestamp: new Date(parseInt(messageData.timestamp) * 1000),
      whatsappMessageId: messageData.id,
      status: 'delivered',
      metadata: {
        context: messageData.context,
        webhookTimestamp: new Date()
      }
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
