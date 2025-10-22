/**
 * Utility Helper Functions
 */

/**
 * Format phone number to E.164 format
 */
exports.formatPhoneNumber = (phone) => {
  // Remove any non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Add country code if not present
  if (!cleaned.startsWith('91') && cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  
  return cleaned;
};

/**
 * Validate webhook signature (if Meta sends one)
 */
exports.validateSignature = (payload, signature, secret) => {
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expectedSignature;
};

/**
 * Parse message text for commands or special patterns
 */
exports.parseMessageContent = (text) => {
  if (!text) return { type: 'text', content: '' };
  
  // Check for commands (e.g., /start, /help)
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

/**
 * Sanitize user input
 */
exports.sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 1000); // Limit length
};

/**
 * Format timestamp for logging
 */
exports.formatTimestamp = (date) => {
  return new Date(date).toISOString();
};
