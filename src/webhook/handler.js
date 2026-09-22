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
const businessCache = require('../utils/businessCache');
const logger = require('../utils/logger');
const WebhookLog = require('../models/WebhookLog');
const {
  handleMessages,
  handleTemplateStatusUpdate,
  handleTemplateQualityUpdate,
  handleAccountAlerts,
  handleBusinessCapabilityUpdate,
  handlePhoneNumberQualityUpdate,
  handleMessageEchoes,
  handleFlows,
  handleTrackingEvents,
  handleUserPreferences
} = require('./eventHandlers');

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
          
          // Find business by WABA ID (using cache)
          let business = await businessCache.getByWabaId(entry.id);
          
          if (!business && entry.changes && entry.changes.length > 0) {
            // Fallback to phone number ID if WABA ID fails
            const firstChange = entry.changes[0];
            const fallbackPhoneId = firstChange.value?.metadata?.phone_number_id || firstChange.value?.phone_number_id;
            
            if (fallbackPhoneId) {
              console.log('🔄 Falling back to find business by Phone Number ID:', fallbackPhoneId);
              business = await businessCache.getByPhoneNumberId(fallbackPhoneId);
            }
          }
          
          if (!business) {
            console.error('❌ No business found for WABA ID:', entry.id);
            continue;
          }
          
          console.log('✅ Found business:', business.name);
          
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              console.log('🔄 Change detected:', change.field);
              const value = change.value;
              const phoneNumberId = value.metadata?.phone_number_id || value.phone_number_id;
              
              // Create webhook log for audit trail
              let webhookLog;
              try {
                webhookLog = await WebhookLog.create({
                  business: business._id,
                  phoneNumberId: phoneNumberId,
                  eventType: change.field,
                  payload: value,
                  signatureVerified: true, // Set by signature verification middleware
                  receivedAt: new Date()
                });
              } catch (logError) {
                console.error('❌ Error creating webhook log:', logError);
              }
              
              try {
                // Route to appropriate handler
                switch (change.field) {
                  case 'messages':
                    console.log('💬 Message event detected');
                    
                    // Use new event handler
                    await handleMessages(value, phoneNumberId);
                    
                    // Also process with existing logic for compatibility
                    if (value.messages && value.messages.length > 0) {
                      await processIncomingMessage(value);
                    }
                    
                    if (value.statuses && value.statuses.length > 0) {
                      await processStatusUpdate(value);
                    }
                    
                    if (value.contacts && value.contacts.length > 0) {
                      await processProfileUpdate(value);
                    }
                    break;
                  
                  case 'message_template_status_update':
                    console.log('📋 Template status update detected');
                    await handleTemplateStatusUpdate(value, phoneNumberId);
                    // Backward compatibility
                    await processTemplateStatusUpdate(value, business, requestId);
                    break;
                  
                  case 'message_template_quality_update':
                    console.log('📊 Template quality update detected');
                    await handleTemplateQualityUpdate(value, phoneNumberId);
                    // Backward compatibility
                    await processTemplateQualityUpdate(value, business, requestId);
                    break;
                  
                  case 'account_alerts':
                    console.log('⚠️ Account alert detected');
                    await handleAccountAlerts(value, phoneNumberId);
                    // Backward compatibility
                    await processAccountAlert(change, value, business, requestId);
                    break;
                  
                  case 'phone_number_quality_update':
                    console.log('📞 Phone quality update detected');
                    await handlePhoneNumberQualityUpdate(value, phoneNumberId);
                    // Backward compatibility
                    await processAccountAlert(change, value, business, requestId);
                    break;
                  
                  case 'account_update':
                    console.log('🏢 Account update detected');
                    await processAccountAlert(change, value, business, requestId);
                    break;
                  
                  case 'business_capability_update':
                    console.log('🔧 Business capability update detected');
                    await handleBusinessCapabilityUpdate(value, phoneNumberId);
                    // Backward compatibility
                    await processBusinessCapabilityUpdate(value, business, requestId);
                    break;
                  
                  case 'message_echoes':
                    console.log('🔄 Message echo detected');
                    await handleMessageEchoes(value, phoneNumberId);
                    // Backward compatibility
                    await processMessageEcho(value, business, requestId);
                    break;
                  
                  case 'flows':
                    console.log('📝 Flow response detected');
                    await handleFlows(value, phoneNumberId);
                    // Backward compatibility
                    const message = value.messages?.[0];
                    if (message?.interactive?.nfm_reply) {
                      await processFlowResponse(message, value.metadata, business, requestId);
                    }
                    break;
                  
                  case 'tracking_events':
                    console.log('📈 Tracking event detected');
                    await handleTrackingEvents(value, phoneNumberId);
                    // Backward compatibility
                    await processTrackingEvent(value, business, requestId);
                    break;
                  
                  case 'user_preferences':
                    console.log('⚙️ User preference update detected');
                    await handleUserPreferences(value, phoneNumberId);
                    // Backward compatibility
                    await processUserPreference(value, business, requestId);
                    break;
                  
                  default:
                    console.log(`ℹ️  Ignoring ${change.field} event`);
                    break;
                }
                
                // Mark webhook log as processed
                if (webhookLog) {
                  await webhookLog.markProcessed();
                }
                
              } catch (processingError) {
                console.error('❌ Error processing webhook event:', processingError);
                
                // Record error in webhook log
                if (webhookLog) {
                  await webhookLog.recordError(processingError);
                }
                
                logger.error('Webhook event processing failed', {
                  requestId,
                  eventType: change.field,
                  error: processingError.message,
                  stack: processingError.stack,
                  businessId: business._id.toString()
                });
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
