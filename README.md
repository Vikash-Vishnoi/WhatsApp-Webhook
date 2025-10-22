# 🚀 WhatsApp Webhook Handler

A standalone webhook service for receiving WhatsApp Business API messages and storing them in MongoDB. Designed to be deployed on Render.com's free tier.

## 📋 Features

- ✅ Webhook verification for Meta's WhatsApp Business API
- 📨 Receive incoming WhatsApp messages
- 💾 Store messages in MongoDB
- 🔄 Create/update conversations automatically
- 📡 Real-time notifications (optional)
- 🐳 Ready for Render.com deployment
- 🆓 Works on free tier hosting

## 🏗️ Architecture

```
WhatsApp User → Meta Servers → Your Webhook (Render.com) → MongoDB → Your App
```

## 📁 Project Structure

```
whatsapp-webhook/
├── index.js                    # Main server file
├── package.json               # Dependencies
├── render.yaml                # Render.com configuration
├── .env.example              # Environment variables template
├── README.md                 # This file
└── src/
    ├── webhook/
    │   ├── verifier.js       # Webhook verification
    │   ├── handler.js        # Webhook POST handler
    │   └── messageProcessor.js # Message processing logic
    ├── database/
    │   └── mongodb.js        # MongoDB operations
    ├── services/
    │   └── notifier.js       # Real-time notifications
    └── utils/
        └── helpers.js        # Utility functions
```

## 🚀 Quick Start

### 1. Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your credentials
# MONGODB_URI=your_mongodb_connection_string
# WHATSAPP_VERIFY_TOKEN=hospital_whatsapp_2024

# Start the server
npm start

# For development with auto-reload
npm run dev
```

### 2. Test Locally

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test webhook verification
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=hospital_whatsapp_2024&hub.challenge=test123"
```

## ☁️ Deploy to Render.com

### Step 1: Prepare Repository

1. Create a new GitHub repository
2. Push this `whatsapp-webhook` folder to your repo:

```bash
cd whatsapp-webhook
git init
git add .
git commit -m "Initial webhook setup"
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-webhook.git
git push -u origin main
```

### Step 2: Deploy on Render.com

1. Go to [Render.com](https://render.com) and sign up/login
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Render will auto-detect the configuration from `render.yaml`
5. Set environment variables in Render dashboard:
   - `MONGODB_URI` - Your MongoDB Atlas connection string
   - `WHATSAPP_VERIFY_TOKEN` - `hospital_whatsapp_2024`
6. Click **"Create Web Service"**
7. Wait for deployment (2-3 minutes)

Your webhook URL will be: `https://YOUR-APP-NAME.onrender.com/webhook`

### Step 3: Configure Meta WhatsApp

1. Go to [Meta Developers Console](https://developers.facebook.com)
2. Select your WhatsApp Business App
3. Navigate to **WhatsApp → Configuration**
4. Click **"Edit"** next to Webhook
5. Enter:
   - **Callback URL**: `https://YOUR-APP-NAME.onrender.com/webhook`
   - **Verify Token**: `hospital_whatsapp_2024`
6. Click **"Verify and Save"**
7. Subscribe to `messages` webhook field

## 🗄️ MongoDB Setup

### Option 1: MongoDB Atlas (Recommended for Production)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Whitelist all IPs (0.0.0.0/0) for Render.com
5. Get connection string:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/whatsapp-marketing
   ```

### Option 2: Local MongoDB (Development Only)

```bash
# Install MongoDB locally
# macOS
brew install mongodb-community

# Ubuntu
sudo apt-get install mongodb

# Start MongoDB
mongod --dbpath ./data/db
```

Connection string: `mongodb://localhost:27017/whatsapp-marketing`

## 📊 Database Schema

### Conversations Collection
```javascript
{
  _id: ObjectId,
  patientPhone: "919509545832",
  patientName: "John Doe",
  status: "open",
  messageCount: 5,
  unreadCount: 2,
  lastMessage: {
    text: "Hello",
    timestamp: Date,
    direction: "incoming"
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Messages Collection
```javascript
{
  _id: ObjectId,
  conversationId: ObjectId,
  phoneNumber: "919509545832",
  text: "Hello, I need help",
  type: "text",
  direction: "incoming",
  timestamp: Date,
  whatsappMessageId: "wamid.XXX",
  status: "delivered",
  metadata: {
    context: {...},
    webhookTimestamp: Date
  },
  createdAt: Date,
  processed: true
}
```

## 🔒 Security

- **Verify Token**: Always use a strong verify token
- **HTTPS Only**: Render.com provides free SSL certificates
- **Environment Variables**: Never commit sensitive data
- **Rate Limiting**: Consider adding rate limiting for production
- **Signature Validation**: Implement webhook signature verification

## 🧪 Testing

### Test Webhook Verification
```bash
curl "https://YOUR-APP-NAME.onrender.com/webhook?hub.mode=subscribe&hub.verify_token=hospital_whatsapp_2024&hub.challenge=test123"
```

Expected response: `test123`

### Test Health Endpoint
```bash
curl https://YOUR-APP-NAME.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-22T10:00:00.000Z",
  "service": "whatsapp-webhook"
}
```

### Test with Real WhatsApp Message
1. Send a message to your WhatsApp Business number
2. Check Render logs for incoming webhook
3. Verify message appears in MongoDB
4. Check your mobile app for the new message

## 📝 Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MONGODB_URI` | Yes | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Token for webhook verification | `hospital_whatsapp_2024` |
| `PORT` | No | Server port (auto-set by Render) | `3000` |
| `BACKEND_URL` | No | Your main backend URL | `https://api.yourapp.com` |
| `WEBHOOK_SECRET` | No | Secret for notification auth | `your-secret-key` |
| `NODE_ENV` | No | Environment | `production` |

## 🐛 Troubleshooting

### Webhook Verification Fails
- Check verify token matches exactly
- Ensure URL is correct and accessible
- Check Render logs for errors

### Messages Not Being Received
- Verify webhook is subscribed to `messages` field
- Check MongoDB connection is working
- Look at Render logs for errors
- Test with curl to ensure server is running

### Database Connection Issues
- Verify MongoDB URI is correct
- Check IP whitelist in MongoDB Atlas
- Ensure database user has proper permissions

### Render.com Specific Issues
- Free tier instances sleep after 15 min inactivity
- First request after sleep takes 30-60 seconds
- Consider upgrading to paid plan for always-on

## 📊 Monitoring

### View Logs in Render.com
1. Go to your service dashboard
2. Click **"Logs"** tab
3. Watch real-time logs

### Check MongoDB Data
```bash
# Connect to MongoDB
mongo "mongodb+srv://cluster.mongodb.net/whatsapp-marketing" --username YOUR_USER

# View conversations
db.conversations.find().pretty()

# View messages
db.messages.find().sort({timestamp: -1}).limit(10).pretty()
```

## 🔄 Updates and Maintenance

### Update Dependencies
```bash
npm update
git commit -am "Update dependencies"
git push
```

Render.com will auto-deploy the changes.

### Backup Database
Use MongoDB Atlas automated backups or:
```bash
mongodump --uri="mongodb+srv://..." --out=./backup
```

## 📚 Resources

- [WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Render.com Documentation](https://render.com/docs)
- [MongoDB Atlas Docs](https://docs.atlas.mongodb.com/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

## 🤝 Support

For issues or questions:
1. Check Render logs
2. Check MongoDB connection
3. Review Meta webhook configuration
4. Test endpoints with curl

## 📄 License

MIT License - Feel free to use this for your projects!

---

**🎉 Ready to receive WhatsApp messages!**

After deployment, your webhook will automatically receive and store all incoming WhatsApp messages in your MongoDB database, making them available in your mobile app.
#
