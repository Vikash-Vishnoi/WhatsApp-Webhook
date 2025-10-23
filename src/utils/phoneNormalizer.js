/**
 * Phone Number Normalizer Utility
 * 
 * Provides phone number normalization for consistent database lookups
 */

/**
 * Normalize phone number for consistent storage and lookup
 * - Removes all non-digit characters
 * - Adds country code if not present (defaults to India: 91)
 * 
 * @param {string} phoneNumber - Phone number to normalize
 * @returns {string} Normalized phone number
 */
exports.normalizePhone = function(phoneNumber) {
  if (!phoneNumber) {
    throw new Error('Phone number is required');
  }
  
  // Remove all non-digits
  const normalized = phoneNumber.toString().replace(/\D/g, '');
  
  // Add country code if not present (default to India)
  return normalized.startsWith('91') ? normalized : `91${normalized}`;
};

/**
 * Format phone number for display
 * 
 * @param {string} phoneNumber - Phone number to format
 * @returns {string} Formatted phone number
 */
exports.formatPhone = function(phoneNumber) {
  const normalized = exports.normalizePhone(phoneNumber);
  
  // Format as: +91 XXXXX XXXXX
  if (normalized.length === 12) {
    return `+${normalized.slice(0, 2)} ${normalized.slice(2, 7)} ${normalized.slice(7)}`;
  }
  
  return `+${normalized}`;
};
