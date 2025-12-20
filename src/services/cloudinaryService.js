/**
 * Cloudinary Service for WhatsApp Webhook
 * Handles permanent storage of incoming media from WhatsApp
 */

const cloudinary = require('cloudinary').v2;
const axios = require('axios');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

class CloudinaryService {
  /**
   * Download media from WhatsApp URL and upload to Cloudinary
   * @param {string} whatsappMediaUrl - Temporary WhatsApp media URL
   * @param {string} mimeType - MIME type of the media
   * @param {string} filename - Original filename
   * @param {string} businessId - Business ID for folder organization
   * @param {string} accessToken - WhatsApp access token for authenticated download
   * @returns {Promise<Object>} Upload result with permanent URL
   */
  async uploadFromWhatsAppUrl(whatsappMediaUrl, mimeType, filename, businessId, accessToken) {
    try {
      console.log('📥 Downloading media from WhatsApp:', whatsappMediaUrl.substring(0, 50) + '...');
      
      // Download media from WhatsApp with authorization
      const headers = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        console.log('🔑 Using access token:', accessToken.substring(0, 20) + '...');
      } else {
        console.error('❌ No access token provided for WhatsApp media download');
        return {
          success: false,
          error: 'No access token provided'
        };
      }
      
      const response = await axios.get(whatsappMediaUrl, {
        headers,
        responseType: 'arraybuffer',
        timeout: 30000 // 30 second timeout
      });

      const buffer = Buffer.from(response.data);
      console.log(`✅ Downloaded ${buffer.length} bytes`);

      // Upload to Cloudinary
      return await this.uploadMedia(buffer, mimeType, filename, `whatsapp-incoming/${businessId}`);
    } catch (error) {
      console.error('❌ Failed to download/upload media:', error.message);
      
      // Log more details for 401 errors
      if (error.response?.status === 401) {
        console.error('🔐 401 Unauthorized - Access token is invalid or expired');
        console.error('   Please regenerate your WhatsApp access token and update it in the database');
        console.error('   Steps: Meta Developer Console → Your App → WhatsApp → API Setup → Generate Token');
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Upload media buffer to Cloudinary
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} mimeType - MIME type
   * @param {string} filename - Original filename
   * @param {string} folder - Cloudinary folder
   * @returns {Promise<Object>} Upload result
   */
  async uploadMedia(fileBuffer, mimeType, filename, folder = 'whatsapp-incoming') {
    try {
      // Determine resource type from MIME type
      const resourceType = this.getResourceType(mimeType);
      
      // Convert buffer to base64 data URI
      const base64Data = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;

      // Extract file extension
      const fileExtension = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
      const baseFilename = filename.replace(/\.[^/.]+$/, '');

      // For raw resources (PDFs, docs), include extension in public_id
      // For images/videos, use format parameter
      const publicId = resourceType === 'raw' && fileExtension
        ? `${Date.now()}-${baseFilename}.${fileExtension}`
        : `${Date.now()}-${baseFilename}`;

      // Upload options
      const uploadOptions = {
        resource_type: resourceType,
        folder: folder,
        public_id: publicId,
        format: resourceType !== 'raw' && fileExtension ? fileExtension : undefined,
        overwrite: false,
        use_filename: true,
        unique_filename: true,
        access_mode: 'public', // Ensure public access for WhatsApp
        type: 'upload', // Public upload type
        // Optimization settings
        quality: 'auto',
        fetch_format: 'auto'
      };

      // For PDFs, add flags for better browser compatibility
      if (mimeType === 'application/pdf') {
        uploadOptions.flags = 'attachment:false'; // Allow inline viewing
      }

      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(base64Data, uploadOptions);

      console.log('☁️  Uploaded to Cloudinary:', result.secure_url);

      // Use the direct secure URL (already public due to access_mode: 'public')
      // No need for signed URLs which cause WhatsApp 401 errors
      const deliveryUrl = result.secure_url;

      return {
        success: true,
        url: deliveryUrl,
        publicId: result.public_id,
        format: result.format,
        resourceType: result.resource_type,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        createdAt: result.created_at
      };
    } catch (error) {
      console.error('❌ Cloudinary upload error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Determine Cloudinary resource type from MIME type
   * @param {string} mimeType - MIME type
   * @returns {string} Resource type (image, video, raw)
   */
  getResourceType(mimeType) {
    if (!mimeType) return 'auto';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'video'; // Cloudinary handles audio as video
    
    // Use 'raw' for documents (PDFs, docs, etc)
    return 'raw';
  }

  /**
   * Delete media from Cloudinary
   * @param {string} publicId - Cloudinary public ID
   * @param {string} resourceType - Resource type
   * @returns {Promise<Object>} Deletion result
   */
  async deleteMedia(publicId, resourceType = 'image') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType
      });

      console.log('🗑️  Deleted from Cloudinary:', publicId);

      return {
        success: true,
        result: result.result
      };
    } catch (error) {
      console.error('❌ Cloudinary deletion error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get optimized URL for media
   * @param {string} publicId - Cloudinary public ID
   * @param {Object} options - Transformation options
   * @returns {string} Optimized URL
   */
  getOptimizedUrl(publicId, options = {}) {
    const defaultOptions = {
      quality: 'auto',
      fetch_format: 'auto',
      ...options
    };

    return cloudinary.url(publicId, defaultOptions);
  }
}

module.exports = new CloudinaryService();
