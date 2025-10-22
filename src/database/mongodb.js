/**
 * MongoDB Database Handler
 * 
 * Handles all database operations for storing WhatsApp messages
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
    console.log('📍 URI:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')); // Hide password
    
    // Log OpenSSL version to help debug TLS issues on hosting platforms
    try {
      console.log('🔒 OpenSSL version:', process.versions.openssl || 'unknown');
    } catch (e) {
      console.log('🔒 Could not read OpenSSL version');
    }

    // Use explicit TLS options to avoid ambiguous defaults on some platforms
    client = new MongoClient(MONGODB_URI, {
      // Use TLS for Atlas connections
      tls: true,
      // Do not allow insecure TLS by default
      tlsAllowInvalidCertificates: false,
      // Timeouts
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      // Enable monitoring commands for better logs (disabled in some environments)
      monitorCommands: false,
    });
    
    await client.connect();
    
    // Test the connection
    await client.db().admin().ping();
    
    db = client.db('whatsapp-marketing');
    console.log('✅ Connected to MongoDB successfully');
    console.log('📦 Database:', db.databaseName);
    
    // Create indexes for better performance
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
    await db.collection('messages').createIndex({ whatsappMessageId: 1 }, { unique: true, sparse: true });
    await db.collection('messages').createIndex({ conversationId: 1, timestamp: -1 });
    await db.collection('conversations').createIndex({ 'contact.phoneNumberNormalized': 1, userId: 1 }, { unique: true });
    console.log('✅ Database indexes created');
  } catch (error) {
    console.log('ℹ️  Indexes already exist or creation failed:', error.message);
  }
}

/**
 * Save an incoming message to the database
 * Using backend-compatible schema
 */
exports.saveMessage = async (messageData) => {
  try {
    const database = await exports.connectToDatabase();
    
    // Check if message already exists (duplicate webhook)
    const existing = await database.collection('messages').findOne({
      whatsappMessageId: messageData.whatsappMessageId
    });

    if (existing) {
      console.log('⚠️  Message already exists, skipping duplicate');
      return { insertedId: existing._id, duplicate: true };
    }

    // Insert new message
    const result = await database.collection('messages').insertOne({
      ...messageData,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Update conversation with latest message info (backend-compatible format)
    await database.collection('conversations').updateOne(
      { _id: messageData.conversationId },
      {
        $set: {
          'lastMessage.text': messageData.content?.text || `[${messageData.type}]`,
          'lastMessage.type': messageData.type,
          'lastMessage.direction': 'incoming',
          'lastMessage.timestamp': messageData.timestamp,
          'lastMessage.status': 'delivered',
          lastMessageAt: messageData.timestamp,
          updatedAt: new Date()
        },
        $inc: {
          unreadCount: 1,
          'metrics.totalMessages': 1,
          'metrics.incomingMessages': 1
        }
      }
    );

    console.log('✅ Message saved with ID:', result.insertedId);
    return result;
  } catch (error) {
    console.error('❌ Error saving message:', error);
    throw error;
  }
};

/**
 * Find existing conversation or create new one
 * Using backend-compatible schema with nested contact and lastMessage
 */
exports.findOrCreateConversation = async ({ phoneNumber, name, userId, lastMessageText, lastMessageTimestamp }) => {
  try {
    const database = await exports.connectToDatabase();
    const { ObjectId } = require('mongodb');
    const Conversation = require('../../../../backend/models/Conversation');
    
    // Normalize phone number for consistent lookups
    const phoneNormalized = Conversation.normalizePhone(phoneNumber);
    
    // Try to find existing conversation by normalized phone and userId
    let conversation = await database.collection('conversations').findOne({
      'contact.phoneNumberNormalized': phoneNormalized,
      userId: new ObjectId(userId)
    });

    if (conversation) {
      console.log('✅ Found existing conversation:', conversation._id);
      return conversation;
    }

    // Create new conversation with backend-compatible schema (nested structure)
    console.log('📝 Creating new conversation for:', phoneNumber);
    const result = await database.collection('conversations').insertOne({
      contact: {
        phoneNumber: phoneNumber,
        phoneNumberNormalized: phoneNormalized,
        name: name || phoneNumber
      },
      userId: new ObjectId(userId),
      status: 'active',
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
      metrics: {
        totalMessages: 0,
        incomingMessages: 0,
        outgoingMessages: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Fetch the newly created conversation
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
 * Get conversation by ID
 */
exports.getConversation = async (conversationId) => {
  const database = await exports.connectToDatabase();
  return await database.collection('conversations').findOne({
    _id: new ObjectId(conversationId)
  });
};

/**
 * Get messages for a conversation
 */
exports.getMessages = async (conversationId, limit = 50) => {
  const database = await exports.connectToDatabase();
  return await database.collection('messages')
    .find({ conversationId: new ObjectId(conversationId) })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
};

/**
 * Close database connection (for graceful shutdown)
 */
exports.closeConnection = async () => {
  if (client) {
    await client.close();
    db = null;
    client = null;
    console.log('🔌 MongoDB connection closed');
  }
};
