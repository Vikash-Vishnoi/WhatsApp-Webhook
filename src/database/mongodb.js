const { MongoClient, ObjectId } = require('mongodb');
const mongoose = require('mongoose');

let db = null;
let client = null;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-marketing';

exports.connectToDatabase = async () => {
  if (db) {
    console.log('ℹ️  Using existing database connection');
    return db;
  }
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('📍 URI:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
    
    client = new MongoClient(MONGODB_URI, {
      // TLS/SSL Configuration
      tls: true,
      tlsAllowInvalidCertificates: false,
      
      // Connection Pool Configuration
      maxPoolSize: 10,              // Maximum number of connections in pool
      minPoolSize: 2,                // Minimum number of connections to maintain
      maxIdleTimeMS: 30000,          // Close idle connections after 30 seconds
      
      // Timeout Configuration
      serverSelectionTimeoutMS: 5000,   // Server selection timeout (5 seconds)
      connectTimeoutMS: 10000,          // Initial connection timeout (10 seconds)
      socketTimeoutMS: 45000,           // Socket timeout (45 seconds)
      
      // Additional Options
      retryWrites: true,             // Retry write operations
      retryReads: true,              // Retry read operations
      monitorCommands: false,        // Disable command monitoring in production
    });
    
    await client.connect();
    await client.db().admin().ping();
    
    db = client.db('whatsapp-marketing');
    console.log('✅ Connected to MongoDB successfully');
    console.log('📦 Database:', db.databaseName);
    console.log('📊 Connection Pool: Min 2, Max 10 connections');
    
    // Connect Mongoose for Business model
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 2
      });
      console.log('✅ Mongoose connected successfully');
    }
    
    // Monitor connection events
    client.on('error', (error) => {
      console.error('❌ MongoDB client error:', error.message);
    });
    
    client.on('close', () => {
      console.warn('⚠️  MongoDB connection closed');
      db = null;
      client = null;
    });
    
    await createIndexes();
    
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
};

async function createIndexes() {
  try {
    await db.collection('conversations').createIndex({ 'contact.phoneNumber': 1, userId: 1 }, { unique: true });
    await db.collection('conversations').createIndex({ userId: 1, lastMessageAt: -1 });
    await db.collection('conversations').createIndex({ userId: 1, status: 1, lastMessageAt: -1 });
    await db.collection('conversations').createIndex({ 'messages.whatsappMessageId': 1 }, { sparse: true });
    console.log('✅ Database indexes created');
  } catch (error) {
    console.log('ℹ️  Indexes already exist or creation failed:', error.message);
  }
}

exports.saveMessageToConversation = async (conversationId, messageData) => {
  try {
    const database = await exports.connectToDatabase();
    
    const existingConv = await database.collection('conversations').findOne({
      _id: conversationId,
      'messages.whatsappMessageId': messageData.whatsappMessageId
    });

    if (existingConv) {
      console.log('⚠️  Message already exists, skipping duplicate');
      return { duplicate: true };
    }

    const messageDoc = {
      _id: new ObjectId(),
      ...messageData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Check current status to decide if we should auto-reopen
    const current = await database.collection('conversations').findOne({ _id: conversationId });

    const setFields = {
      'lastMessage.text': messageData.content?.text || `[${messageData.type}]`,
      'lastMessage.type': messageData.type,
      'lastMessage.direction': 'incoming',
      'lastMessage.timestamp': messageData.timestamp,
      'lastMessage.status': 'delivered',
      lastMessageAt: messageData.timestamp,
      updatedAt: new Date(),
      'conversationWindow.isOpen': true,
      'conversationWindow.openedAt': messageData.timestamp,
      'conversationWindow.expiresAt': new Date(messageData.timestamp.getTime() + 24 * 60 * 60 * 1000),
      'conversationWindow.category': 'user_initiated'
    };

    if (current && (current.status === 'archived' || current.status === 'closed')) {
      setFields['status'] = 'active';
    }

    const result = await database.collection('conversations').updateOne(
      { _id: conversationId },
      {
        $push: {
          messages: messageDoc
        },
        $set: setFields,
        $inc: {
          unreadCount: 1,
          'metrics.totalMessages': 1,
          'metrics.incomingMessages': 1,
          'metrics.conversationsOpened': 1
        }
      }
    );

    console.log('✅ Message added to conversation, embedded message ID:', messageDoc._id);
    return { 
      messageId: messageDoc._id, 
      conversationId: conversationId,
      modified: result.modifiedCount > 0
    };
  } catch (error) {
    console.error('❌ Error saving message:', error);
    throw error;
  }
};

exports.findOrCreateConversation = async ({ phoneNumber, name, userId, businessId, lastMessageText, lastMessageTimestamp }) => {
  try {
    const database = await exports.connectToDatabase();
    const { normalizePhone } = require('../utils/phoneNormalizer');
    
    const phoneNormalized = normalizePhone(phoneNumber);
    
    let conversation = await database.collection('conversations').findOne({
      'contact.phoneNumber': phoneNormalized,
      userId: new ObjectId(userId),
      businessId: new ObjectId(businessId),
      isDeleted: false
    });

    if (conversation) {
      console.log('✅ Found existing conversation:', conversation._id);
      return conversation;
    }

    console.log('📝 Creating new conversation for:', phoneNumber);
    const result = await database.collection('conversations').insertOne({
      contact: {
        phoneNumber: phoneNormalized,
        name: name || phoneNumber
      },
      userId: new ObjectId(userId),
      businessId: new ObjectId(businessId),
      status: 'active',
      messages: [],
      lastMessage: {
        text: lastMessageText || 'New conversation',
        type: 'text',
        direction: 'incoming',
        timestamp: lastMessageTimestamp || new Date(),
        status: 'delivered'
      },
      lastMessageAt: lastMessageTimestamp || new Date(),
      unreadCount: 0,
      source: 'whatsapp',
      conversationWindow: {
        isOpen: true,
        openedAt: lastMessageTimestamp || new Date(),
        expiresAt: new Date((lastMessageTimestamp || new Date()).getTime() + 24 * 60 * 60 * 1000),
        category: 'user_initiated'
      },
      metrics: {
        totalMessages: 0,
        incomingMessages: 0,
        outgoingMessages: 0,
        templateMessagesSent: 0,
        conversationsOpened: 0,
        responseRate: 0,
        avgResponseTime: 0
      },
      quality: {
        hasReplied: false,
        isResponsive: false,
        qualityScore: 0,
        engagementLevel: 'none'
      },
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    conversation = await database.collection('conversations').findOne({
      _id: result.insertedId
    });

    console.log('✅ Created new conversation:', conversation._id);
    return conversation;
  } catch (error) {
    console.error('❌ Error finding/creating conversation:', error);
    throw error;
  }
};

exports.getConversation = async (conversationId) => {
  const database = await exports.connectToDatabase();
  return await database.collection('conversations').findOne({
    _id: new ObjectId(conversationId),
    isDeleted: false
  });
};

exports.getMessages = async (conversationId, limit = 50) => {
  const database = await exports.connectToDatabase();
  const conversation = await database.collection('conversations').findOne(
    { _id: new ObjectId(conversationId) },
    { projection: { messages: { $slice: -limit } } }
  );
  
  return conversation?.messages || [];
};

exports.updateMessageStatus = async (whatsappMessageId, status, statusTimestamp) => {
  try {
    const database = await exports.connectToDatabase();
    
    const conversation = await database.collection('conversations').findOne({
      'messages.whatsappMessageId': whatsappMessageId
    });

    if (!conversation) {
      console.log('⚠️  Message not found for status update');
      return null;
    }

    // Find the message to get its _id
    const message = conversation.messages.find(msg => msg.whatsappMessageId === whatsappMessageId);
    if (!message) {
      console.log('⚠️  Message not found in conversation');
      return null;
    }

    const updateFields = {
      'messages.$.status': status,
      'messages.$.updatedAt': new Date()
    };

    if (status === 'delivered') {
      updateFields['messages.$.deliveredAt'] = statusTimestamp || new Date();
    } else if (status === 'read') {
      updateFields['messages.$.readAt'] = statusTimestamp || new Date();
    }

    const result = await database.collection('conversations').updateOne(
      { 
        _id: conversation._id,
        'messages.whatsappMessageId': whatsappMessageId 
      },
      {
        $set: updateFields
      }
    );

    console.log('✅ Message status updated:', status);
    
    // Return conversation and message IDs for socket notification
    return {
      success: true,
      conversationId: conversation._id,
      messageId: message._id,
      status: status
    };
  } catch (error) {
    console.error('❌ Error updating message status:', error);
    throw error;
  }
};

/**
 * Update campaign recipient status based on message status
 * This is called when a message sent via campaign gets status updates
 */
exports.updateCampaignRecipientStatus = async (whatsappMessageId, status, statusTimestamp) => {
  try {
    const database = await exports.connectToDatabase();
    
    // Find campaign with this message ID in recipients
    const campaign = await database.collection('campaigns').findOne({
      'recipients.whatsappMessageId': whatsappMessageId
    });

    if (!campaign) {
      // Not a campaign message, skip
      return null;
    }

    const updateFields = {
      'recipients.$.status': status
    };

    if (status === 'sent') {
      updateFields['recipients.$.sentAt'] = statusTimestamp || new Date();
    } else if (status === 'delivered') {
      updateFields['recipients.$.deliveredAt'] = statusTimestamp || new Date();
    } else if (status === 'read') {
      updateFields['recipients.$.readAt'] = statusTimestamp || new Date();
    } else if (status === 'failed') {
      // Failed reason will be set separately if available
    }

    await database.collection('campaigns').updateOne(
      {
        _id: campaign._id,
        'recipients.whatsappMessageId': whatsappMessageId
      },
      {
        $set: updateFields
      }
    );

    // Update campaign stats
    const updatedCampaign = await database.collection('campaigns').findOne({ _id: campaign._id });
    const stats = {
      total: updatedCampaign.recipients.length,
      sent: updatedCampaign.recipients.filter(r => r.status === 'sent').length,
      delivered: updatedCampaign.recipients.filter(r => r.status === 'delivered' || r.status === 'read').length,
      read: updatedCampaign.recipients.filter(r => r.status === 'read').length,
      failed: updatedCampaign.recipients.filter(r => r.status === 'failed').length,
      pending: updatedCampaign.recipients.filter(r => r.status === 'pending').length
    };

    await database.collection('campaigns').updateOne(
      { _id: campaign._id },
      { $set: { stats } }
    );

    console.log(`✅ Campaign recipient status updated: ${whatsappMessageId} → ${status}`);
    
    return {
      success: true,
      campaignId: campaign._id,
      status: status
    };
  } catch (error) {
    console.error('❌ Error updating campaign recipient status:', error);
    // Don't throw error - campaign update is non-critical
    return null;
  }
};

exports.closeConnection = async () => {
  if (client) {
    await client.close();
    db = null;
    client = null;
    console.log('🔌 MongoDB connection closed');
  }
};

exports.saveMessage = async (messageData) => {
  console.warn('⚠️  Using legacy saveMessage - please use saveMessageToConversation instead');
  return await exports.saveMessageToConversation(messageData.conversationId, messageData);
};

/**
 * Add a reaction to an existing message
 * @param {ObjectId} conversationId - The conversation ID
 * @param {String} whatsappMessageId - The WhatsApp message ID to react to
 * @param {Object} reactionData - { from, emoji, timestamp }
 * @returns {Object} Result with success status and message ID
 */
exports.addReactionToMessage = async (conversationId, whatsappMessageId, reactionData) => {
  try {
    const database = await exports.connectToDatabase();
    
    console.log('🔍 Looking for message with WhatsApp ID:', whatsappMessageId);
    
    // Find the conversation containing this message
    const conversation = await database.collection('conversations').findOne({
      _id: conversationId,
      'messages.whatsappMessageId': whatsappMessageId
    });

    if (!conversation) {
      console.log('⚠️  Message not found for reaction');
      return { success: false, error: 'Message not found' };
    }

    // Find the specific message to get its _id
    const targetMessage = conversation.messages.find(msg => msg.whatsappMessageId === whatsappMessageId);
    
    if (!targetMessage) {
      console.log('⚠️  Could not locate target message');
      return { success: false, error: 'Message not found' };
    }

    console.log('✅ Found target message:', targetMessage._id);
    console.log('   Adding reaction:', reactionData.emoji, 'from:', reactionData.from);

    // Check if this user already reacted with this emoji (update instead of duplicate)
    const existingReactionIndex = targetMessage.reactions?.findIndex(
      r => r.from === reactionData.from && r.emoji === reactionData.emoji
    );

    let updateOperation;
    
    if (existingReactionIndex !== undefined && existingReactionIndex >= 0) {
      // Update existing reaction timestamp
      console.log('   Updating existing reaction');
      updateOperation = {
        $set: {
          [`messages.$[msg].reactions.${existingReactionIndex}.timestamp`]: reactionData.timestamp,
          updatedAt: new Date()
        }
      };
    } else if (reactionData.emoji === '') {
      // Empty emoji means remove reaction
      console.log('   Removing reaction from user');
      updateOperation = {
        $pull: {
          'messages.$[msg].reactions': { from: reactionData.from }
        },
        $set: {
          updatedAt: new Date()
        }
      };
    } else {
      // Add new reaction
      console.log('   Adding new reaction');
      updateOperation = {
        $push: {
          'messages.$[msg].reactions': {
            from: reactionData.from,
            emoji: reactionData.emoji,
            timestamp: reactionData.timestamp
          }
        },
        $set: {
          updatedAt: new Date()
        }
      };
    }

    const result = await database.collection('conversations').updateOne(
      { _id: conversationId },
      updateOperation,
      {
        arrayFilters: [
          { 'msg.whatsappMessageId': whatsappMessageId }
        ]
      }
    );

    if (result.modifiedCount > 0) {
      console.log('✅ Reaction added/updated successfully');
      return { 
        success: true, 
        messageId: targetMessage._id,
        conversationId: conversationId
      };
    } else {
      console.log('⚠️  No changes made to conversation');
      return { success: false, error: 'Update failed' };
    }
  } catch (error) {
    console.error('❌ Error adding reaction:', error);
    return { success: false, error: error.message };
  }
};

/**
 * ✅ FEATURE: Profile Updates Webhook
 * Update contact profile information (name, photo, about)
 * Tracks profile change history
 */
exports.updateContactProfile = async (profileData) => {
  try {
    const database = await exports.connectToDatabase();
    
    console.log('🔍 Finding conversation for phone:', profileData.phoneNumber);
    
    // Find conversation by phone number
    const conversation = await database.collection('conversations').findOne({
      'contact.phoneNumber': profileData.phoneNumber,
      isDeleted: false
    });

    if (!conversation) {
      console.log('⚠️  No conversation found for this contact');
      return { success: false, error: 'Conversation not found' };
    }

    console.log('✅ Found conversation:', conversation._id);
    
    // Track what changed
    const changes = [];
    const oldProfile = conversation.contact;
    
    if (oldProfile.name !== profileData.name) {
      changes.push({
        field: 'name',
        oldValue: oldProfile.name,
        newValue: profileData.name,
        timestamp: profileData.updatedAt
      });
    }
    
    if (oldProfile.profilePhoto !== profileData.profilePhoto) {
      changes.push({
        field: 'profilePhoto',
        oldValue: oldProfile.profilePhoto,
        newValue: profileData.profilePhoto,
        timestamp: profileData.updatedAt
      });
    }
    
    if (profileData.about && oldProfile.about !== profileData.about) {
      changes.push({
        field: 'about',
        oldValue: oldProfile.about,
        newValue: profileData.about,
        timestamp: profileData.updatedAt
      });
    }

    if (changes.length === 0) {
      console.log('ℹ️  No changes detected in profile');
      return { 
        success: true, 
        conversationId: conversation._id,
        changes: []
      };
    }

    console.log(`📝 Profile changes detected: ${changes.map(c => c.field).join(', ')}`);

    // Update conversation contact info
    const updateDoc = {
      $set: {
        'contact.name': profileData.name,
        'contact.profilePhoto': profileData.profilePhoto,
        updatedAt: profileData.updatedAt
      },
      $push: {
        'contact.profileHistory': {
          $each: changes,
          $slice: -20 // Keep last 20 profile changes
        }
      }
    };

    // Add about field if provided
    if (profileData.about) {
      updateDoc.$set['contact.about'] = profileData.about;
    }

    const result = await database.collection('conversations').updateOne(
      { _id: conversation._id },
      updateDoc
    );

    if (result.modifiedCount > 0) {
      console.log('✅ Contact profile updated successfully');
      console.log('   Changes:', changes.map(c => `${c.field}: "${c.oldValue}" → "${c.newValue}"`).join(', '));
      
      return { 
        success: true,
        conversationId: conversation._id,
        changes: changes
      };
    } else {
      console.log('⚠️  No modifications made');
      return { 
        success: true,
        conversationId: conversation._id,
        changes: []
      };
    }
  } catch (error) {
    console.error('❌ Error updating contact profile:', error);
    return { success: false, error: error.message };
  }
};
