/**
 * WhatsApp Webhook Message Handler
 * 
 * Receives incoming WhatsApp messages from Meta's servers
 * and processes them asynchronously.
 */

const { processIncomingMessage } = require('./messageProcessor');

exports.handleWebhook = async (req, res) => {
  console.log('📨 Webhook POST request received');
  
  // Immediately respond to WhatsApp with 200 OK
  // This is CRITICAL - Meta expects a quick response
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  
  try {
    // Log the raw webhook data for debugging
    console.log('📦 Webhook body:', JSON.stringify(body, null, 2));
    
    // Check if this is a WhatsApp webhook event
    if (body.object === 'whatsapp_business_account') {
      console.log('✅ Valid WhatsApp webhook event detected');
      
      // Process each entry in the webhook
      if (body.entry && Array.isArray(body.entry)) {
        for (const entry of body.entry) {
          console.log('📋 Processing entry:', entry.id);
          
          // Process each change in the entry
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              console.log('🔄 Change detected:', change.field);
              
              // Check if this is a messages event
              if (change.field === 'messages') {
                console.log('💬 Message event detected');
                
                // Process the message asynchronously
                processIncomingMessage(change.value)
                  .catch(error => {
                    console.error('❌ Error processing message:', error);
                  });
              } else {
                console.log(`ℹ️  Ignoring ${change.field} event`);
              }
            }
          }
        }
      }
    } else {
      console.log('⚠️  Non-WhatsApp webhook event:', body.object);
    }
  } catch (error) {
    console.error('❌ Error handling webhook:', error);
    // Don't throw error - we already sent 200 OK to Meta
  }
};
