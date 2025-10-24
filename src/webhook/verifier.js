const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'hospital_whatsapp_2024';

exports.verifyWebhook = (req, res) => {
  console.log('🔍 Webhook verification request received');
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('Verification details:', {
    mode,
    tokenReceived: token,
    tokenExpected: VERIFY_TOKEN,
    tokenMatch: token === VERIFY_TOKEN,
    challenge: challenge ? 'Present' : 'Missing'
  });

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully!');
      console.log('📤 Sending challenge response:', challenge);
      
      res.status(200).send(challenge);
    } else {
      console.error('❌ Verification failed: Token mismatch');
      console.error('Expected:', VERIFY_TOKEN);
      console.error('Received:', token);
      res.sendStatus(403);
    }
  } else {
    console.error('❌ Verification failed: Missing mode or token');
    res.sendStatus(400);
  }
};
