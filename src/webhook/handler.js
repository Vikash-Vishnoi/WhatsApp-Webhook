const { processIncomingMessage } = require('./messageProcessor');

exports.handleWebhook = async (req, res) => {
  console.log('📨 Webhook POST request received');
  
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  
  try {
    console.log('📦 Webhook body:', JSON.stringify(body, null, 2));
    
    if (body.object === 'whatsapp_business_account') {
      console.log('✅ Valid WhatsApp webhook event detected');
      
      if (body.entry && Array.isArray(body.entry)) {
        for (const entry of body.entry) {
          console.log('📋 Processing entry:', entry.id);
          
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              console.log('🔄 Change detected:', change.field);
              
              if (change.field === 'messages') {
                console.log('💬 Message event detected');
                
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
  }
};
