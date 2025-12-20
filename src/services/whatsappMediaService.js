const axios = require('axios');

/**
 * WhatsApp Media API Service
 * Retrieves media URLs from WhatsApp using media IDs
 */

const WHATSAPP_API_VERSION = 'v22.0';
const WHATSAPP_API_BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

/**
 * Get media URL from WhatsApp using media ID
 * @param {string} mediaId - WhatsApp media ID
 * @param {string} accessToken - Business WhatsApp access token
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
async function getMediaUrl(mediaId, accessToken) {
  try {
    console.log('📞 Calling WhatsApp API to get media URL for ID:', mediaId);
    
    const response = await axios.get(
      `${WHATSAPP_API_BASE_URL}/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );

    if (response.data && response.data.url) {
      console.log('✅ Media URL retrieved successfully');
      return {
        success: true,
        url: response.data.url,
        mime_type: response.data.mime_type,
        sha256: response.data.sha256,
        file_size: response.data.file_size
      };
    }

    console.error('❌ No URL in WhatsApp API response:', response.data);
    return {
      success: false,
      error: 'No URL in response'
    };
  } catch (error) {
    console.error('❌ Error fetching media URL from WhatsApp:', {
      mediaId,
      error: error.message,
      response: error.response?.data
    });
    
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Download media from WhatsApp URL
 * @param {string} url - Media URL from WhatsApp
 * @param {string} accessToken - Business WhatsApp access token
 * @returns {Promise<{success: boolean, buffer?: Buffer, error?: string}>}
 */
async function downloadMedia(url, accessToken) {
  try {
    console.log('📥 Downloading media from WhatsApp URL');
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      responseType: 'arraybuffer',
      timeout: 30000 // 30 seconds for large files
    });

    const buffer = Buffer.from(response.data);
    console.log(`✅ Downloaded ${buffer.length} bytes`);
    
    return {
      success: true,
      buffer
    };
  } catch (error) {
    console.error('❌ Error downloading media:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getMediaUrl,
  downloadMedia
};
