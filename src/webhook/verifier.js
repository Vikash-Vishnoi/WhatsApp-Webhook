const Business = require('../models/Business');

/**
 * Multi-Business Webhook Verification
 * Verifies webhook by checking token against any active business
 */
exports.verifyWebhook = async (req, res) => {
  console.log('🔍 Webhook verification request received');
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('Verification details:', {
    mode,
    tokenReceived: token ? token.substring(0, 10) + '...' : 'Missing',
    challenge: challenge ? 'Present' : 'Missing'
  });

  if (!mode || !token) {
    console.error('❌ Verification failed: Missing mode or token');
    return res.sendStatus(400);
  }

  if (mode !== 'subscribe') {
    console.error('❌ Verification failed: Invalid mode:', mode);
    return res.sendStatus(403);
  }

  try {
    // ✅ MULTI-BUSINESS: Find any active business with this verify token
    const business = await Business.findOne({
      'whatsappConfig.verifyToken': token,
      status: 'active',
      isDeleted: false
    });

    if (business) {
      console.log('✅ Webhook verified successfully for business:', business.name);
      console.log('📤 Sending challenge response');
      return res.status(200).send(challenge);
    } else {
      console.error('❌ Verification failed: No business found with this token');
      return res.sendStatus(403);
    }
  } catch (error) {
    console.error('❌ Verification error:', error);
    return res.sendStatus(500);
  }
};
