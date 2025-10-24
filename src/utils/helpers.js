exports.formatPhoneNumber = (phone) => {
  let cleaned = phone.replace(/\D/g, '');
  
  if (!cleaned.startsWith('91') && cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  
  return cleaned;
};

exports.validateSignature = (payload, signature, secret) => {
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expectedSignature;
};

exports.parseMessageContent = (text) => {
  if (!text) return { type: 'text', content: '' };
  
  if (text.startsWith('/')) {
    const parts = text.split(' ');
    return {
      type: 'command',
      command: parts[0].substring(1).toLowerCase(),
      args: parts.slice(1)
    };
  }
  
  return {
    type: 'text',
    content: text
  };
};

exports.sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '')
    .substring(0, 1000);
};

exports.formatTimestamp = (date) => {
  return new Date(date).toISOString();
};
