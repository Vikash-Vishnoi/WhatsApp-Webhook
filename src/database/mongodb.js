/**
 * MongoDB Database Handler - Conversation Model
 * 
 * Uses Conversation model with embedded messages
 */

const { MongoClient, ObjectId } = require('mongodb');

let db = null;
let client = null;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-marketing';

/**
 * Connect to MongoDB database
 */
exports.connectToDatabase = async () => {
  if (db) {
    console.log('ℹ️  Using existing database connection');
    return db;
  }
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('📍 URI:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
    
    client = new MongoClient(MONGODB_URI, {
      tls: true,
      tlsAllowInvalidCertificates: false,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      monitorCommands: false,
    });
    
    await client.connect();
    await client.db().admin().ping();
    
    db = client.db('whatsapp-marketing');
    console.log('✅ Connected to MongoDB successfully');
    console.log('📦 Database:', db.databaseName);
    
    await createIndexes();
    
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
};

/**
 * Create database indexes for optimal performance
 */
async function createIndexes() {
  try {
    // Indexes for Conversation collection
    await db.collection('conversations').createIndex({ 'contact.phoneNumber': 1, userId: 1 }, { unique: true });
    await db.collection('conversations').createIndex({ userId: 1, lastMessageAt: -1 });
    await db.collection('conversations').createIndex({ userId: 1, status: 1, lastMessageAt: -1 });
    await db.collection('conversations').createIndex({ 'messages.whatsappMessageId': 1 }, { sparse: true });
    console.log('✅ Database indexes created');
  } catch (error) {
    console.log('ℹ️  Indexes already exist or creation failed:', error.message);
  }
}

/**
 * Save an incoming message directly to conversation's messages array
 */
exports.saveMessageToConversation = async (conversationId, messageData) => {
  try {
    const database = await exports.connectToDatabase();
    
    // Check if message already exists (duplicate webhook)
    const existingConv = await database.collection('conversations').findOne({
      _id: conversationId,
      'messages.whatsappMessageId': messageData.whatsappMessageId
    });

    if (existingConv) {
      console.log('⚠️  Message already exists, skipping duplicate');
      return { duplicate: true };
    }

    // Prepare message with _id for embedded document
    const messageDoc = {
      _id: new ObjectId(),
      ...messageData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add message to conversation's messages array and update metadata
    const result = await database.collection('conversations').updateOne(
      { _id: conversationId },
      {
        $push: {
          messages: messageDoc
        },
        $set: {
          'lastMessage.text': messageData.content?.text || `[${messageData.type}]`,
          'lastMessage.type': messageData.type,
          'lastMessage.direction': 'incoming',
          'lastMessage.timestamp': messageData.timestamp,
          'lastMessage.status': 'delivered',
          lastMessageAt: messageData.timestamp,
          updatedAt: new Date(),
          // Open conversation window (24 hours from now)
          'conversationWindow.isOpen': true,
          'conversationWindow.openedAt': messageData.timestamp,
          'conversationWindow.expiresAt': new Date(messageData.timestamp.getTime() + 24 * 60 * 60 * 1000),
          'conversationWindow.category': 'user_initiated'
        },
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

/**
 * Find existing conversation or create new one
 * Using Conversation model
 */
exports.findOrCreateConversation = async ({ phoneNumber, name, userId, lastMessageText, lastMessageTimestamp }) => {
  try {
    const database = await exports.connectToDatabase();
    const { normalizePhone } = require('../utils/phoneNormalizer');
    
    const phoneNormalized = normalizePhone(phoneNumber);
    
    // Try to find existing conversation
    let conversation = await database.collection('conversations').findOne({
      'contact.phoneNumber': phoneNormalized,
      userId: new ObjectId(userId),
      isDeleted: false
    });

    if (conversation) {
      console.log('✅ Found existing conversation:', conversation._id);
      return conversation;
    }

    // Create new conversation with empty messages array
    console.log('📝 Creating new conversation for:', phoneNumber);
    const result = await database.collection('conversations').insertOne({
      contact: {
        phoneNumber: phoneNormalized,
        name: name || phoneNumber
      },
      userId: new ObjectId(userId),
      status: 'active',
      messages: [], // Empty array - messages will be added via $push
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

/**
 * Get conversation by ID (with all embedded messages)
 */
exports.getConversation = async (conversationId) => {
  const database = await exports.connectToDatabase();
  return await database.collection('conversations').findOne({
    _id: new ObjectId(conversationId),
    isDeleted: false
  });
};

/**
 * Get messages for a conversation (extract from embedded array)
 */
exports.getMessages = async (conversationId, limit = 50) => {
  const database = await exports.connectToDatabase();
  const conversation = await database.collection('conversations').findOne(
    { _id: new ObjectId(conversationId) },
    { projection: { messages: { $slice: -limit } } }
  );
  
  return conversation?.messages || [];
};

/**
 * Update message status within conversation
 */
exports.updateMessageStatus = async (whatsappMessageId, status, statusTimestamp) => {
  try {
    const database = await exports.connectToDatabase();
    
    // Find conversation containing this message
    const conversation = await database.collection('conversations').findOne({
      'messages.whatsappMessageId': whatsappMessageId
    });

    if (!conversation) {
      console.log('⚠️  Message not found for status update');
      return null;
    }

    // Update the specific message's status
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
    return result;
  } catch (error) {
    console.error('❌ Error updating message status:', error);
    throw error;
  }
};

/**
 * Close database connection
 */
exports.closeConnection = async () => {
  if (client) {
    await client.close();
    db = null;
    client = null;
    console.log('🔌 MongoDB connection closed');
  }
};

// Legacy support - map old saveMessage to new function
exports.saveMessage = async (messageData) => {
  console.warn('⚠️  Using legacy saveMessage - please use saveMessageToConversation instead');
  return await exports.saveMessageToConversation(messageData.conversationId, messageData);
};
