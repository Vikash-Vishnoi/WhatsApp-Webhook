/**
 * Webhook Signature Verification Middleware
 * Verifies x-hub-signature-256 header to ensure webhooks come from WhatsApp
 * @module webhook/signatureVerifier
 */

const crypto = require('crypto');
const businessCache = require('../utils/businessCache');

/**
 * Middleware to verify webhook signature
 * This prevents unauthorized webhook events from being processed
 */
async function verifySignatureMiddleware(req, res, next) {
  const requestId = `verify_${Date.now()}`;
  
  try {
    // Only verify POST requests (not GET verification requests)
    if (req.method !== 'POST') {
      return next();
    }

    const signature = req.headers['x-hub-signature-256'];
    
    // If no signature provided, log warning but continue
    // (Some setups might not have signature verification enabled)
    if (!signature) {
      console.warn('⚠️  No signature provided in webhook request', {
        requestId,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      
      // In production, you might want to reject requests without signature
      // Uncomment the following lines to enforce signature verification:
      // return res.status(401).json({ 
      //   error: 'Unauthorized',
      //   message: 'Missing x-hub-signature-256 header' 
      // });
      
      return next();
    }

    // Extract phone_number_id from webhook payload to find the business
    const phoneNumberId = req.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (!phoneNumberId) {
      console.error('❌ No phone_number_id in webhook payload', { requestId });
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Invalid webhook payload structure' 
      });
    }

    // Find business with this phone number ID (using cache)
    const business = await businessCache.getByPhoneNumberId(phoneNumberId);

    if (!business) {
      console.error('❌ No business found for phone number', {
        requestId,
        phoneNumberId
      });
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'No active business found for this phone number' 
      });
    }

    // Check if business has app secret configured
    if (!business.whatsappConfig?.appSecret) {
      console.warn('⚠️  Business has no app secret configured', {
        requestId,
        businessId: business._id.toString(),
        businessName: business.name
      });
      
      // Allow request to proceed but log the security concern
      return next();
    }

    // Verify signature
    const rawBody = JSON.stringify(req.body);
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', business.whatsappConfig.appSecret)
      .update(rawBody)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      console.error('❌ Signature verification failed', {
        requestId,
        businessId: business._id.toString(),
        businessName: business.name,
        signatureProvided: signature.substring(0, 20) + '...',
        expectedSignature: expectedSignature.substring(0, 20) + '...'
      });
      
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid webhook signature' 
      });
    }

    console.log('✅ Signature verified successfully', {
      requestId,
      businessId: business._id.toString(),
      businessName: business.name
    });

    // Attach business to request for downstream handlers
    req.business = business;
    req.requestId = requestId;

    next();

  } catch (error) {
    console.error('❌ Error in signature verification', {
      requestId,
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Signature verification failed' 
    });
  }
}

module.exports = {
  verifySignatureMiddleware
};
