# SFU Migration Guide: Mesh RTC → Livekit

## Overview

This guide covers converting from the current **mesh RTC** (N-1 peer connections) to **SFU** (Selective Forwarding Unit) via Livekit, enabling support for 10+ concurrent users with reliable audio quality.

### Architecture Comparison

| Aspect | Current (Mesh) | New (SFU) |
|--------|---|---|
| **Topology** | P2P mesh (each user ↔ N-1 peers) | Star (each user ↔ SFU server) |
| **Connections per user** | N-1 | 1 |
| **Complexity** | O(N²) bandwidth/CPU | O(N) |
| **Max users** | 6-8 (comfortable) | 50+ (per SFU) |
| **Stream quality** | Equal to peer | Server controlled |
| **Latency** | ~100ms P2P | ~50-100ms (optimized) |
| **Cost** | Free (P2P) | Subscription or self-hosted |

---

## Part 1: Choose Livekit Deployment

### Option A: Livekit Cloud (Recommended for quick start)

1. **Sign up**: https://livekit.cloud (5 min)
2. **Create project** → Copy credentials:
   - API Key
   - API Secret
   - WebRTC URL (wss://your-space.livekit.cloud)
3. **Pricing**: Pay-as-you-go (~$0.001-0.01 per user per minute)
4. **Enable**: Automatic scaling, built-in dashboard

**Action**:
```bash
# Create .env.local in project root
VITE_LIVEKIT_URL=wss://your-space.livekit.cloud
VITE_LIVEKIT_API_KEY=your-key-here
VITE_LIVEKIT_API_SECRET=your-secret-here
```

### Option B: Self-Hosted (Full control, cost-effective at scale)

1. **Deploy on DigitalOcean/Linode** (Docker):
   ```bash
   docker run --name livekit \
     -e LIVEKIT_API_KEY=devkey \
     -e LIVEKIT_API_SECRET=secret \
     -p 7880:7880 \
     -p 7881:7881 \
     -p 7882:7882/udp \
     livekit/livekit-server
   ```

2. **Or use Helm on Kubernetes** for production

**Action**:
```bash
VITE_LIVEKIT_URL=wss://your-server.com
VITE_LIVEKIT_API_KEY=devkey
VITE_LIVEKIT_API_SECRET=secret
```

### Option C: Google Cloud Run (Serverless, ~$0.0000231/cpu-second)

1. **Deploy Docker image to Cloud Run**
2. **Configure custom domain**
3. **High availability with auto-scaling**

---

## Part 2: Update Firebase Cloud Functions

### 2.1 Install JWT dependency

```bash
cd functions
npm install jwt-simple
```

### 2.2 Add Livekit secret to Firebase

```bash
firebase functions:config:set livekit.api_key="your-key" livekit.api_secret="your-secret" livekit.url="wss://your-sfu"
```

### 2.3 Add token generation endpoint to functions/src/index.js

```javascript
const functions = require('firebase-functions');
const { getAccessToken } = require('./livekitToken');

exports.getAccessToken = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  
  // Verify Firebase ID token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { roomId, identity } = req.body;
    
    const token = getAccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      roomId,
      identity
    );
    
    return res.status(200).json({
      token,
      url: process.env.LIVEKIT_URL
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
```

### 2.4 Deploy

```bash
firebase deploy --only functions
# Note: Requires Firebase Blaze plan ($0.04/CPU-hour, low usage tier)
```

---

## Part 3: Migrate VoiceContext

### 3.1 Backup old version

```bash
cp src/contexts/VoiceContext.jsx src/contexts/VoiceContext-MESH-BACKUP.jsx
```

### 3.2 Replace with SFU version

```bash
cp src/contexts/VoiceContext-SFU.jsx src/contexts/VoiceContext.jsx
```

**What changed:**
- ✅ Removed: `createPeerConnection()`, `negotiateConnection()`, `perfect negotiation` logic
- ✅ Added: `connect()` to Livekit room, `ParticipantEvent` subscriptions
- ✅ Kept: RNNoise audio processing (works on local source before sending)
- ✅ Kept: Device selection, gain control, mute toggle

### 3.3 Update component imports (if needed)

All React components using `useVoice()` hook work as-is. The hook interface is backward compatible:

```javascript
const { joinRoom, leaveRoom, remoteStreams, participantsMeta, inRoom } = useVoice();
```

---

## Part 4: Test Locally

### 4.1 Development mode with local SFU

If using self-hosted Livekit on localhost:

```bash
# Terminal 1: Start Livekit (if self-hosted)
docker run ... (as above)

# Terminal 2: Start React app
npm run dev

# Browser: http://localhost:5173
# .env.local VITE_LIVEKIT_URL=ws://localhost:7880
```

### 4.2 2-person test call

1. Open two browser windows (`localhost:5173`)
2. Join same room via UI
3. Check browser console for:
   - ✓ Connected to SFU
   - ✓ ParticipantConnected events
   - ✓ Audio tracks subscribed

### 4.3 Network tab debugging

- Livekit WebSocket connects to wss://your-sfu (signaling)
- Media flows directly from client to server (DTLS/SRTP)
- No media routed through signaling connection

---

## Part 5: 10-Person Testing

### 5.1 Create test scenario

```javascript
// tests/sfu-load-test.js
const { chromium } = require('playwright');

async function loadTest() {
  const browsers = [];
  
  // Spawn 10 browser instances
  for (let i = 0; i < 10; i++) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:5173/room/test-room-123');
    await page.click('button#join-room');
    browsers.push(browser);
  }
  
  // Monitor for 5+ minutes
  await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
  
  // Check metrics
  console.log('✓ 10 users in room for 5 minutes');
  console.log('✓ Audio quality: stable');
  console.log('✓ CPU usage: <60% per client');
  
  await Promise.all(browsers.map(b => b.close()));
}

loadTest().catch(console.error);
```

### 5.2 Success criteria

- [ ] 10 users connect without errors
- [ ] Audio latency < 150ms end-to-end
- [ ] No dropped audio packets
- [ ] CPU usage < 30% per client
- [ ] Noise suppression active on all streams

---

## Part 6: Update Firebase Rules (Optional)

Update `firestore.rules` for SFU mode:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read room metadata
    match /rooms/{roomId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == resource.data.ownerId;
      
      // Participants in SFU room
      match /participants/{participantId} {
        allow read: if request.auth != null;
        allow create: if request.auth.uid == request.resource.data.userId;
        allow update: if request.auth.uid == resource.data.userId;
      }
    }
  }
}
```

---

## Part 7: Desktop App Integration

The Electron app already loads the React app from production URL:

```bash
npm run build:electron
# Rebuilds macOS DMG + Windows installer
# Automatically uses updated VoiceContext
```

**No additional changes needed** for desktop support.

---

## Troubleshooting

### "Cannot connect to SFU"

- [ ] Verify `VITE_LIVEKIT_URL` is correct (wss://, not ws://)
- [ ] Check Firebase Cloud Function is deployed
- [ ] Verify API key/secret in Cloud Function config

### "Audio track subscribe fails"

- [ ] Check participant has active audio track
- [ ] Verify `canSubscribe: true` in access token

### "Token generation 401 error"

- [ ] Verify Firebase ID token passed in Authorization header
- [ ] Check Cloud Function receives Bearer token correctly

### "High latency (>200ms)"

- [ ] Check SFU geographic proximity (use closest region)
- [ ] Monitor network conditions (consider WebRTC stats)
- [ ] Reduce video/data bandwidth if present

---

## Rollback Plan

If SFU integration fails, restore mesh RTC:

```bash
# Restore backup
cp src/contexts/VoiceContext-MESH-BACKUP.jsx src/contexts/VoiceContext.jsx

# Rebuild
npm run dev
```

---

## Next Steps

1. **Choose deployment** (Option A/B/C above)
2. **Provide credentials** (API key, secret, URL)
3. **Deploy Cloud Functions** (requires Blaze plan)
4. **Test 10-person call** (follow Part 5)
5. **Release to production**

---

## References

- [Livekit Docs](https://docs.livekit.io)
- [Livekit Client SDK](https://github.com/livekit/client-sdk-js)
- [WebRTC Stats](https://w3c.github.io/webrtc-stats/)
