/**
 * Webhook Handler - Process WhatsApp webhook events
 * Aligned with backend webhook implementation
 * Includes proper logging, validation, error handling, and multi-business support
 * @module webhook/handler
 */

const Business = require('../../backend/models/Business');
const logger = require('../../backend/utils/logger');
const { sendError } = require('../../backend/utils/errorCodes');
const { 
  processIncomingMessage, 
  processStatusUpdate, 
  processProfileUpdate,
  processTemplateStatusUpdate,
  processAccountAlert,
  processFlowResponse
} = require('./messageProcessor');

/**
 * Verify webhook signature for security
 */
function verifyWebhookSignature(business, rawBody, signature) {
  try {
    if (!signature || !business.whatsappConfig?.appSecret) {
      return false;
    }

    const crypto = require('crypto');
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', business.whatsappConfig.appSecret)
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('Error verifying webhook signature', {
      error: error.message,
      businessId: business._id.toString()
    });
    return false;
  }
}

/**
 * Handle incoming webhook POST requests
 */
exports.handleWebhook = async (req, res) => {
  const requestId = `webhook_${Date.now()}`;
  const startTime = Date.now();

  try {
    logger.info('Webhook POST request received', { requestId });

    // Always respond with 200 OK quickly to acknowledge receipt
    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;

    // Validate webhook object type
    if (body.object !== 'whatsapp_business_account') {
      logger.warn('Invalid webhook object type', {
        requestId,
        object: body.object,
        expected: 'whatsapp_business_account'
      });
      return;
    }

    // Validate entry array
    if (!Array.isArray(body.entry) || body.entry.length === 0) {
      logger.error('Invalid webhook payload: missing or empty entry array', {
        requestId,
        hasEntry: !!body.entry,
        isArray: Array.isArray(body.entry)
      });
      return;
    }

    logger.info('Valid WhatsApp webhook event detected', {
      requestId,
      entryCount: body.entry.length
    });

    // Process each entry
    for (const entry of body.entry) {
      const entryId = entry.id;
      logger.debug('Processing entry', { requestId, entryId });

      if (!Array.isArray(entry.changes)) {
        logger.warn('Entry missing changes array', { requestId, entryId });
        continue;
      }

      for (const change of entry.changes) {
        const changeField = change.field;
        const value = change.value;

        logger.debug('Processing change', {
          requestId,
          entryId,
          field: changeField
        });

        // Extract phone number ID for business routing
        const phoneNumberId = value.metadata?.phone_number_id;

        if (!phoneNumberId) {
          logger.error('No phone_number_id in webhook', {
            requestId,
            field: changeField
          });
          continue;
        }

        // Find business by phone number ID (multi-business support)
        const business = await Business.findByPhoneNumberId(phoneNumberId);

        if (!business) {
          logger.error('No business found for phone number', {
            requestId,
            phoneNumberId,
            field: changeField
          });
          continue;
        }

        logger.info('Webhook routed to business', {
          requestId,
          businessId: business._id.toString(),
          businessName: business.name,
          field: changeField
        });

        // Verify webhook signature for security
        const signature = req.headers['x-hub-signature-256'];
        if (signature && business.whatsappConfig?.appSecret) {
          const rawBody = JSON.stringify(req.body);
          const isValid = verifyWebhookSignature(business, rawBody, signature);

          if (!isValid) {
            logger.error('Signature verification failed', {
              requestId,
              businessId: business._id.toString(),
              businessName: business.name
            });
            continue;
          }

          logger.debug('Signature verified', {
            requestId,
            businessId: business._id.toString()
          });
        }

        // Route to appropriate processor based on webhook type
        try {
          // Handle incoming messages
          if (changeField === 'messages' && value.messages) {
            logger.info('Processing incoming messages', {
              requestId,
              messageCount: value.messages.length,
              businessId: business._id.toString()
            });

            await processIncomingMessage(value, business, requestId);
          }

          // Handle message status updates
          if (value.statuses && Array.isArray(value.statuses)) {
            logger.info('Processing status updates', {
              requestId,
              statusCount: value.statuses.length,
              businessId: business._id.toString()
            });

            await processStatusUpdate(value, business, requestId);
          }

          // Handle contact profile updates
          if (changeField === 'contacts' && value.contacts) {
            logger.info('Processing contact updates', {
              requestId,
              contactCount: value.contacts.length,
              businessId: business._id.toString()
            });

            await processProfileUpdate(value, business, requestId);
          }

          // Handle template status updates
          if (value.message_template_status_update) {
            logger.info('Processing template status update', {
              requestId,
              templateName: value.message_template_status_update.message_template_name,
              businessId: business._id.toString()
            });

            await processTemplateStatusUpdate(value.message_template_status_update, business, requestId);
          }

          // Handle account alerts (quality rating, account status)
          if (
            changeField === 'phone_number_quality_update' ||
            changeField === 'account_update' ||
            changeField === 'account_alerts'
          ) {
            logger.info('Processing account alert', {
              requestId,
              field: changeField,
              businessId: business._id.toString()
            });

            await processAccountAlert(change, value, business, requestId);
          }

          // Handle flow responses
          if (value.messages) {
            for (const message of value.messages) {
              if (
                message.type === 'interactive' &&
                message.interactive?.type === 'nfm_reply'
              ) {
                logger.info('Processing flow response', {
                  requestId,
                  messageId: message.id,
                  businessId: business._id.toString()
                });

                await processFlowResponse(message, value.metadata, business, requestId);
              }
            }
          }

          logger.debug('Webhook change processed successfully', {
            requestId,
            field: changeField,
            businessId: business._id.toString()
          });

        } catch (handlerError) {
          logger.error('Error in webhook processor', {
            requestId,
            field: changeField,
            businessId: business._id.toString(),
            error: handlerError.message,
            stack: handlerError.stack
          });
          // Continue processing other changes even if one fails
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Webhook processing completed', {
      requestId,
      duration: `${duration}ms`,
      entriesProcessed: body.entry.length
    });

  } catch (error) {
    logger.error('Webhook processing error', {
      requestId,
      error: error.message,
      stack: error.stack
    });
    // Note: We already sent 200 OK, so can't send error response
    // WhatsApp expects 200 OK to prevent retries for the same event
  }
};

module.exports = {
  handleWebhook: exports.handleWebhook
};
