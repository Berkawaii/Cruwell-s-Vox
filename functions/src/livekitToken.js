/**
 * Livekit Token Generation Module
 * 
 * Generates JWT access tokens for Livekit SFU connections.
 * Called by client when joining a room to authenticate with SFU.
 */

const jwt = require('jwt-simple');

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'your-api-key';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'your-api-secret';

/**
 * Generate Livekit access token
 * 
 * @param {string} apiKey - Livekit API key
 * @param {string} apiSecret - Livekit API secret
 * @param {string} roomName - Room to join
 * @param {string} identity - User identifier
 * @param {object} options - Token options (canPublish, canSubscribe, etc)
 * @returns {string} JWT token
 */
function createAccessToken(apiKey, apiSecret, roomName, identity, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = 24 * 60 * 60; // 24 hours
  
  const payload = {
    iss: apiKey,
    sub: identity,
    name: identity,
    iat: now,
    exp: now + ttl,
    nbf: now - 1,
    video: {
      canPublish: options.canPublish !== false,
      canSubscribe: options.canSubscribe !== false,
      canPublishData: options.canPublishData === true,
      room: roomName,
      roomJoin: true,
      canPublishSources: [
        'camera',
        'microphone',
        'screen_share'
      ]
    }
  };
  
  if (options.metadata) {
    payload.metadata = JSON.stringify(options.metadata);
  }
  
  return jwt.encode(payload, apiSecret, 'HS256');
}

/**
 * HTTP Cloud Function: Generate token for room join
 * 
 * Request body:
 * {
 *   "roomId": "room-123",
 *   "userId": "user-uid",
 *   "identity": "User Display Name"
 * }
 * 
 * Response:
 * {
 *   "token": "eyJhbGc...",
 *   "url": "wss://your-sfu.com"
 * }
 */
async function getAccessToken(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { roomId, userId, identity } = req.body;
  
  if (!roomId || !userId || !identity) {
    return res.status(400).json({ 
      error: 'Missing required fields: roomId, userId, identity' 
    });
  }
  
  // Verify user auth token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // TODO: Verify Firebase ID token here
    const firebaseToken = authHeader.split('Bearer ')[1];
    // const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    
    // Generate Livekit token
    const token = createAccessToken(
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      roomId,
      identity,
      {
        canPublish: true,
        canSubscribe: true,
        metadata: {
          userId,
          joinedAt: new Date().toISOString()
        }
      }
    );
    
    const livekitUrl = process.env.LIVEKIT_URL || 'wss://your-sfu.livekit.cloud';
    
    return res.status(200).json({
      token,
      url: livekitUrl
    });
    
  } catch (error) {
    console.error('Token generation error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate token',
      details: error.message 
    });
  }
}

module.exports = {
  createAccessToken,
  getAccessToken
};
