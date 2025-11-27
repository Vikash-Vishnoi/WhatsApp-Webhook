const { 
  processIncomingMessage, 
  processStatusUpdate, 
  processTemplateStatusUpdate, 
  processAccountAlert, 
  processProfileUpdate, 
  processFlowResponse,
  processTemplateQualityUpdate,
  processBusinessCapabilityUpdate,
  processMessageEcho,
  processTrackingEvent,
  processUserPreference
} = require('./messageProcessor');
const Business = require('../models/Business');
const logger = require('../utils/logger');

exports.handleWebhook = async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log('📨 Webhook POST request received');
  console.log('Request ID:', requestId);
  
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  
  try {
    console.log('📦 Webhook body:', JSON.stringify(body, null, 2));
    
    if (body.object === 'whatsapp_business_account') {
      console.log('✅ Valid WhatsApp webhook event detected');
      
      if (body.entry && Array.isArray(body.entry)) {
        for (const entry of body.entry) {
          console.log('📋 Processing entry:', entry.id);
          
          // Find business by WABA ID
          const business = await Business.findOne({ 
            'whatsappConfig.wabaId': entry.id 
          });
          
          if (!business) {
            console.error('❌ No business found for WABA ID:', entry.id);
            continue;
          }
          
          console.log('✅ Found business:', business.name);
          
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              console.log('🔄 Change detected:', change.field);
              const value = change.value;
              
              // ✅ Process incoming messages
              if (change.field === 'messages') {
                console.log('💬 Message event detected');
                
                // Process incoming messages
                if (value.messages && value.messages.length > 0) {
                  processIncomingMessage(value)
                    .catch(error => {
                      console.error('❌ Error processing message:', error);
                      logger.error('Message processing failed', { 
                        requestId, 
                        error: error.message,
                        businessId: business._id.toString()
                      });
                    });
                }
                
                // Process message status updates (sent, delivered, read)
                if (value.statuses && value.statuses.length > 0) {
                  processStatusUpdate(value)
                    .catch(error => {
                      console.error('❌ Error processing status:', error);
                      logger.error('Status update failed', { 
                        requestId, 
                        error: error.message,
                        businessId: business._id.toString()
                      });
                    });
                }
                
                // Process contact profile updates
                if (value.contacts && value.contacts.length > 0) {
                  processProfileUpdate(value)
                    .catch(error => {
                      console.error('❌ Error processing profile update:', error);
                      logger.error('Profile update failed', { 
                        requestId, 
                        error: error.message,
                        businessId: business._id.toString()
                      });
                    });
                }
              }
              
              // ✅ Process template status updates (approved/rejected)
              else if (change.field === 'message_template_status_update') {
                console.log('📋 Template status update detected');
                processTemplateStatusUpdate(value, business, requestId)
                  .catch(error => {
                    console.error('❌ Error processing template status:', error);
                    logger.error('Template status update failed', { 
                      requestId, 
                      error: error.message,
                      businessId: business._id.toString()
                    });
                  });
              }
              
              // ✅ Process template quality updates
              else if (change.field === 'message_template_quality_update') {
                console.log('📊 Template quality update detected');
                processTemplateQualityUpdate(value, business, requestId)
                  .catch(error => {
                    console.error('❌ Error processing template quality:', error);
                    logger.error('Template quality update failed', { 
                      requestId, 
                      error: error.message,
                      businessId: business._id.toString()
                    });
                  });
              }
              
              // ✅ Process account alerts (quality rating, restrictions)
              else if (change.field === 'account_alerts' || 
                       change.field === 'phone_number_quality_update' ||
                       change.field === 'account_update') {
                console.log('⚠️ Account alert detected:', change.field);
                processAccountAlert(change, value, business, requestId)
                  .catch(error => {
                    console.error('❌ Error processing account alert:', error);
                    logger.error('Account alert processing failed', { 
                      requestId, 
                      error: error.message,
                      businessId: business._id.toString()
                    });
                  });
              }
              
              // ✅ Process business capability updates
              else if (change.field === 'business_capability_update') {
                console.log('🔧 Business capability update detected');
                processBusinessCapabilityUpdate(value, business, requestId)
                  .catch(error => {
                    console.error('❌ Error processing business capability:', error);
                    logger.error('Business capability update failed', { 
                      requestId, 
                      error: error.message,
                      businessId: business._id.toString()
                    });
                  });
              }
              
              // ✅ Process message echoes (messages sent from other channels)
              else if (change.field === 'message_echoes') {
                console.log('🔄 Message echo detected');
                processMessageEcho(value, business, requestId)
                  .catch(error => {
                    console.error('❌ Error processing message echo:', error);
                    logger.error('Message echo processing failed', { 
                      requestId, 
                      error: error.message,
                      businessId: business._id.toString()
                    });
                  });
              }
              
              // ✅ Process flows (interactive form responses)
              else if (change.field === 'flows') {
                console.log('📝 Flow response detected');
                const message = value.messages?.[0];
                if (message?.interactive?.nfm_reply) {
                  processFlowResponse(message, value.metadata, business, requestId)
                    .catch(error => {
                      console.error('❌ Error processing flow response:', error);
                      logger.error('Flow response processing failed', { 
                        requestId, 
                        error: error.message,
                        businessId: business._id.toString()
                      });
                    });
                }
              }
              
              // ✅ Process tracking events (clicks, views, interactions)
              else if (change.field === 'tracking_events') {
                console.log('📈 Tracking event detected');
                processTrackingEvent(value, business, requestId)
                  .catch(error => {
                    console.error('❌ Error processing tracking event:', error);
                    logger.error('Tracking event processing failed', { 
                      requestId, 
                      error: error.message,
                      businessId: business._id.toString()
                    });
                  });
              }
              
              // ✅ Process user preferences (opt-in/out, settings)
              else if (change.field === 'user_preferences') {
                console.log('⚙️ User preference update detected');
                processUserPreference(value, business, requestId)
                  .catch(error => {
                    console.error('❌ Error processing user preference:', error);
                    logger.error('User preference update failed', { 
                      requestId, 
                      error: error.message,
                      businessId: business._id.toString()
                    });
                  });
              }
              
              else {
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
    logger.error('Webhook processing failed', { 
      requestId, 
      error: error.message,
      stack: error.stack
    });
  }
};
