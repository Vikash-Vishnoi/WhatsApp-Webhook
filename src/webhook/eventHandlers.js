const Business = require('../models/Business');
const Template = require('../models/Template');
const Conversation = require('../models/Conversation');
const FlowResponse = require('../models/FlowResponse');
const logger = require('../utils/logger');

/**
 * Webhook Event Handlers
 * 
 * Handles all 10 WhatsApp Business API webhook event types:
 * 1. messages
 * 2. message_template_status_update
 * 3. message_template_quality_update
 * 4. account_alerts
 * 5. business_capability_update
 * 6. phone_number_quality_update
 * 7. message_echoes
 * 8. flows
 * 9. tracking_events
 * 10. user_preferences
 */

/**
 * 1. Handle incoming/outgoing messages
 */
async function handleMessages(value, phoneNumberId) {
  try {
    const business = await Business.findByPhoneNumberId(phoneNumberId);
    if (!business) {
      logger.warn(`Business not found for phone number: ${phoneNumberId}`);
      return;
    }

    // This is typically handled by messageProcessor.js
    // Just log for now
    logger.info(`Message event received for business: ${business._id}`);
    
    return { success: true };
  } catch (error) {
    logger.error('Error handling messages event:', error);
    throw error;
  }
}

/**
 * 2. Handle template status updates (APPROVED, REJECTED, PAUSED, etc.)
 */
async function handleTemplateStatusUpdate(value, phoneNumberId) {
  try {
    const business = await Business.findByPhoneNumberId(phoneNumberId);
    if (!business) {
      logger.warn(`Business not found for phone number: ${phoneNumberId}`);
      return;
    }

    const { message_template_id, message_template_name, message_template_language, event } = value;
    
    // Find template by WhatsApp ID or name
    const template = await Template.findOne({
      businessId: business._id,
      $or: [
        { whatsappTemplateId: message_template_id },
        { name: message_template_name, language: message_template_language }
      ]
    });

    if (template) {
      // Map WhatsApp event to status
      let whatsappStatus = null;
      let reason = null;

      if (event === 'APPROVED') {
        whatsappStatus = 'APPROVED';
      } else if (event === 'REJECTED') {
        whatsappStatus = 'REJECTED';
        reason = value.reason || 'Template rejected by WhatsApp';
      } else if (event === 'PAUSED') {
        whatsappStatus = 'PAUSED';
        reason = value.reason || 'Template paused by WhatsApp';
      } else if (event === 'DISABLED') {
        whatsappStatus = 'DISABLED';
        reason = value.reason || 'Template disabled';
      }

      await template.updateStatus({
        whatsappStatus,
        reason
      });

      // Update business template health
      const stats = await Template.getHealthStats(business._id);
      await business.updateTemplateHealth(stats);

      // Create alert
      await business.addAlert({
        alertType: 'TEMPLATE_STATUS_UPDATE',
        severity: whatsappStatus === 'REJECTED' ? 'WARNING' : 'INFO',
        title: `Template ${event}`,
        description: `Template "${message_template_name}" has been ${event.toLowerCase()}`,
        metadata: { templateId: template._id, event, reason }
      });

      logger.info(`Template status updated: ${template.name} - ${event}`);
    } else {
      logger.warn(`Template not found: ${message_template_name}`);
    }

    return { success: true };
  } catch (error) {
    logger.error('Error handling template status update:', error);
    throw error;
  }
}

/**
 * 3. Handle template quality score updates (GREEN, YELLOW, RED)
 */
async function handleTemplateQualityUpdate(value, phoneNumberId) {
  try {
    const business = await Business.findByPhoneNumberId(phoneNumberId);
    if (!business) {
      logger.warn(`Business not found for phone number: ${phoneNumberId}`);
      return;
    }

    const { message_template_id, message_template_name, quality_score, reason } = value;

    const template = await Template.findOne({
      businessId: business._id,
      $or: [
        { whatsappTemplateId: message_template_id },
        { name: message_template_name }
      ]
    });

    if (template) {
      await template.updateQualityScore({
        score: quality_score,
        reason: reason || 'Quality score updated by WhatsApp'
      });

      // Create alert if quality is not GREEN
      if (quality_score !== 'GREEN') {
        await business.addAlert({
          alertType: 'TEMPLATE_QUALITY_UPDATE',
          severity: quality_score === 'RED' ? 'CRITICAL' : 'WARNING',
          title: `Template Quality: ${quality_score}`,
          description: `Template "${message_template_name}" quality is now ${quality_score}`,
          metadata: { templateId: template._id, qualityScore: quality_score, reason }
        });
      }

      logger.info(`Template quality updated: ${template.name} - ${quality_score}`);
    }

    return { success: true };
  } catch (error) {
    logger.error('Error handling template quality update:', error);
    throw error;
  }
}

/**
 * 4. Handle account alerts (warnings, violations, policy issues)
 */
async function handleAccountAlerts(value, phoneNumberId) {
  try {
    const business = await Business.findByPhoneNumberId(phoneNumberId);
    if (!business) {
      logger.warn(`Business not found for phone number: ${phoneNumberId}`);
      return;
    }

    const { alert_type, alert_severity, title, description } = value;

    // Map severity
    let severity = 'INFO';
    if (alert_severity === 'WARNING' || alert_severity === 'MEDIUM') {
      severity = 'WARNING';
    } else if (alert_severity === 'CRITICAL' || alert_severity === 'HIGH') {
      severity = 'CRITICAL';
    }

    await business.addAlert({
      alertType: alert_type || 'ACCOUNT_WARNING',
      severity,
      title: title || 'Account Alert',
      description: description || 'Alert from WhatsApp',
      metadata: value
    });

    logger.warn(`Account alert for business ${business._id}: ${title}`);

    return { success: true };
  } catch (error) {
    logger.error('Error handling account alerts:', error);
    throw error;
  }
}

/**
 * 5. Handle business capability updates (restrictions, limitations)
 */
async function handleBusinessCapabilityUpdate(value, phoneNumberId) {
  try {
    const business = await Business.findByPhoneNumberId(phoneNumberId);
    if (!business) {
      logger.warn(`Business not found for phone number: ${phoneNumberId}`);
      return;
    }

    const { capability, status, reason } = value;

    // Update capability status
    if (capability && status) {
      if (capability === 'MESSAGING') {
        business.capabilities.messaging = status;
      } else if (capability === 'PAYMENT') {
        business.capabilities.payment = status;
      } else if (capability === 'BUSINESS_MANAGEMENT') {
        business.capabilities.businessManagement = status;
      }

      business.capabilities.lastUpdated = new Date();
      await business.save();

      // Create alert if restricted/disabled
      if (status === 'RESTRICTED' || status === 'DISABLED') {
        await business.addAlert({
          alertType: 'BUSINESS_CAPABILITY_UPDATE',
          severity: status === 'DISABLED' ? 'CRITICAL' : 'WARNING',
          title: `${capability} ${status}`,
          description: reason || `Business capability ${capability} is now ${status}`,
          metadata: { capability, status, reason }
        });
      }

      logger.info(`Business capability updated: ${capability} - ${status}`);
    }

    return { success: true };
  } catch (error) {
    logger.error('Error handling business capability update:', error);
    throw error;
  }
}

/**
 * 6. Handle phone number quality updates (quality rating, messaging limits)
 */
async function handlePhoneNumberQualityUpdate(value, phoneNumberId) {
  try {
    const business = await Business.findByPhoneNumberId(phoneNumberId);
    if (!business) {
      logger.warn(`Business not found for phone number: ${phoneNumberId}`);
      return;
    }

    const { 
      quality_score, 
      quality_rating, 
      current_limit, 
      name_status,
      reason 
    } = value;

    await business.updatePhoneQuality({
      score: quality_score,
      rating: quality_rating,
      tier: current_limit,
      nameStatus: name_status,
      reason: reason || 'Quality updated by WhatsApp'
    });

    // Create alert if quality degraded
    if (quality_score === 'YELLOW' || quality_score === 'RED') {
      await business.addAlert({
        alertType: 'PHONE_NUMBER_QUALITY_UPDATE',
        severity: quality_score === 'RED' ? 'CRITICAL' : 'WARNING',
        title: `Phone Quality: ${quality_score}`,
        description: `Phone number quality rating is now ${quality_rating}`,
        metadata: { qualityScore: quality_score, qualityRating: quality_rating, tier: current_limit, reason }
      });
    }

    logger.info(`Phone quality updated for business ${business._id}: ${quality_rating}`);

    return { success: true };
  } catch (error) {
    logger.error('Error handling phone quality update:', error);
    throw error;
  }
}

/**
 * 7. Handle message echoes (confirmation of sent messages)
 */
async function handleMessageEchoes(value, phoneNumberId) {
  try {
    const business = await Business.findByPhoneNumberId(phoneNumberId);
    if (!business) {
      logger.warn(`Business not found for phone number: ${phoneNumberId}`);
      return;
    }

    // Update last echo timestamp
    business.messageEchoes.lastEchoTimestamp = new Date();
    await business.save();

    // This is typically handled by messageProcessor.js for actual message updates
    logger.info(`Message echo received for business: ${business._id}`);

    return { success: true };
  } catch (error) {
    logger.error('Error handling message echoes:', error);
    throw error;
  }
}

/**
 * 8. Handle WhatsApp Flow completions
 */
async function handleFlows(value, phoneNumberId) {
  try {
    const business = await Business.findByPhoneNumberId(phoneNumberId);
    if (!business) {
      logger.warn(`Business not found for phone number: ${phoneNumberId}`);
      return;
    }

    const { flow_id, flow_token, response } = value;

    // Create or update flow response
    if (flow_id && response) {
      await FlowResponse.create({
        business: business._id,
        flowId: flow_id,
        flowToken: flow_token,
        response: response,
        phoneNumberId: phoneNumberId,
        receivedAt: new Date()
      });

      logger.info(`Flow response received: ${flow_id}`);
    }

    return { success: true };
  } catch (error) {
    logger.error('Error handling flows:', error);
    throw error;
  }
}

/**
 * 9. Handle tracking events (conversions, pixel events)
 */
async function handleTrackingEvents(value, phoneNumberId) {
  try {
    const business = await Business.findByPhoneNumberId(phoneNumberId);
    if (!business) {
      logger.warn(`Business not found for phone number: ${phoneNumberId}`);
      return;
    }

    const { event_name, event_id, pixel_id } = value;

    // Update analytics tracking info
    if (pixel_id) {
      business.analytics.pixelId = pixel_id;
    }

    if (event_name && event_id) {
      const existingEvent = business.analytics.conversionTracking.events.find(
        e => e.eventId === event_id
      );

      if (!existingEvent) {
        business.analytics.conversionTracking.events.push({
          eventName: event_name,
          eventId: event_id
        });
      }
    }

    business.analytics.lastTrackingUpdate = new Date();
    await business.save();

    logger.info(`Tracking event received: ${event_name}`);

    return { success: true };
  } catch (error) {
    logger.error('Error handling tracking events:', error);
    throw error;
  }
}

/**
 * 10. Handle user preference updates
 */
async function handleUserPreferences(value, phoneNumberId) {
  try {
    const business = await Business.findByPhoneNumberId(phoneNumberId);
    if (!business) {
      logger.warn(`Business not found for phone number: ${phoneNumberId}`);
      return;
    }

    // User preferences are typically stored at contact level
    // This is a placeholder for future implementation
    logger.info(`User preference update received for business: ${business._id}`);

    return { success: true };
  } catch (error) {
    logger.error('Error handling user preferences:', error);
    throw error;
  }
}

module.exports = {
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
};
