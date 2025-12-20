/**
 * Business Cache
 * Caches business app secrets and verify tokens to reduce database queries
 * Cache expires after 5 minutes to allow for updates
 */

const Business = require('../models/Business');

class BusinessCache {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get business by phone number ID (with caching)
   */
  async getByPhoneNumberId(phoneNumberId) {
    const cacheKey = `phone:${phoneNumberId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('✅ Business cache hit:', phoneNumberId);
      return cached.business;
    }
    
    console.log('🔍 Business cache miss, querying database:', phoneNumberId);
    const business = await Business.findOne({
      'whatsappConfig.phoneNumberId': phoneNumberId,
      status: 'active'
    }).select('+whatsappConfig.appSecret +whatsappConfig.verifyToken +whatsappConfig.accessToken');
    
    if (business) {
      this.cache.set(cacheKey, {
        business,
        timestamp: Date.now()
      });
    }
    
    return business;
  }

  /**
   * Get business by verify token (with caching)
   */
  async getByVerifyToken(verifyToken) {
    const cacheKey = `token:${verifyToken}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('✅ Business token cache hit');
      return cached.business;
    }
    
    console.log('🔍 Business token cache miss, querying database');
    const business = await Business.findOne({
      'whatsappConfig.verifyToken': verifyToken,
      status: 'active'
    });
    
    if (business) {
      this.cache.set(cacheKey, {
        business,
        timestamp: Date.now()
      });
    }
    
    return business;
  }

  /**
   * Get business by WABA ID (with caching)
   */
  async getByWabaId(wabaId) {
    const cacheKey = `waba:${wabaId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('✅ Business WABA cache hit:', wabaId);
      return cached.business;
    }
    
    console.log('🔍 Business WABA cache miss, querying database:', wabaId);
    const business = await Business.findOne({
      'whatsappConfig.wabaId': wabaId,
      status: 'active'
    }).select('+whatsappConfig.appSecret +whatsappConfig.verifyToken +whatsappConfig.accessToken');
    
    if (business) {
      this.cache.set(cacheKey, {
        business,
        timestamp: Date.now()
      });
    }
    
    return business;
  }

  /**
   * Clear cache for a specific phone number ID or all cache
   */
  clear(phoneNumberId = null) {
    if (phoneNumberId) {
      const cacheKey = `phone:${phoneNumberId}`;
      this.cache.delete(cacheKey);
      console.log('🗑️  Cache cleared for:', phoneNumberId);
    } else {
      this.cache.clear();
      console.log('🗑️  All cache cleared');
    }
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      ttl: this.CACHE_TTL,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Singleton instance
const businessCache = new BusinessCache();

module.exports = businessCache;
