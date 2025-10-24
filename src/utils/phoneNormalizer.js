exports.normalizePhone = function(phoneNumber) {
  if (!phoneNumber) {
    throw new Error('Phone number is required');
  }
  
  const normalized = phoneNumber.toString().replace(/\D/g, '');
  
  return normalized.startsWith('91') ? normalized : `91${normalized}`;
};

exports.formatPhone = function(phoneNumber) {
  const normalized = exports.normalizePhone(phoneNumber);
  
  if (normalized.length === 12) {
    return `+${normalized.slice(0, 2)} ${normalized.slice(2, 7)} ${normalized.slice(7)}`;
  }
  
  return `+${normalized}`;
};
