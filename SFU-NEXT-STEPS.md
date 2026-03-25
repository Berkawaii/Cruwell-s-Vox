## 🎯 SFU Deployment: 3 Steps to 10-Person Support

### Status
- ✅ Desktop app working (Electron)
- ✅ Cloud Functions code ready (Firebase Blaze upgrade needed to deploy)
- ⏳ Livekit SFU setup (do this now)
- ⏳ VoiceContext refactoring for SFU (ready to implement)

---

## Step 1: Livekit SFU Setup (Choose One)

### Option A: **Livekit Cloud** (Recommended - 5 min setup)
**Best for**: Quick start, managed service, 5 GB/month free tier

```bash
1. Go to https://livekit.cloud
2. Sign up (free tier available)
3. Create a project
4. Copy:
   - API Key
   - API Secret
   - WebRTC URL (e.g., ws://your-instance.livekit.cloud)
5. Save these for VoiceContext setup
```

**Cost**: Free tier includes 5 GB/month. After that: $0.01-$0.05 per GB (pay-as-you-go)

---

### Option B: Self-Hosted Livekit (30 min setup)
**Best for**: Full control, predictable costs, $5-20/mo VPS

**On your VPS (DigitalOcean, Linode, etc):**

```bash
# 1. SSH into VPS
ssh root@your-vps-ip

# 2. Install Docker
apt update && apt install -y docker.io docker-compose

# 3. Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3'
services:
  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml --dev
    ports:
      - "7880:7880"
      - "7881:7881"
      - "7882:7882/udp"
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
    environment:
      - LIVEKIT_API_KEY=your-api-key-here
      - LIVEKIT_API_SECRET=your-api-secret-here
EOF

# 4. Create livekit.yaml config
cat > livekit.yaml << 'EOF'
port: 7880
bind_addresses: []
rtc:
  port_range_start: 50000
  port_range_end: 60000
  enable_loopback_candidate: false
room:
  auto_create: true
  empty_timeout: 300
  max_participants: 100
keys:
  your-api-key-here: your-api-secret-here
EOF

# 5. Start Livekit
docker-compose up -d

# 6. Verify (wait 10s for startup)
curl http://localhost:7880/health
```

**Get URLs:**
```bash
# Your WebRTC URL:
ws://your-vps-ip:7882  (WebSocket signaling)
wss://your-vps-ip:7882 (Secure, requires HTTPS proxy like Nginx)

# Other endpoints:
RTC_ENDPOINT: http://your-vps-ip:7880/rtc/publish
```

---

### Option C: Google Cloud Run (Medium complexity)
**Best for**: Firebase ecosystem, auto-scaling

```bash
# Deploy Livekit container to Cloud Run
gcloud run deploy livekit \
  --image livekit/livekit-server:latest \
  --port 7880 \
  --memory 2Gi \
  --region us-central1
```

---

## Step 2: Add Livekit Credentials to Your App

Create `.env.local` in workspace root:

```env
VITE_LIVEKIT_URL=ws://your-instance.livekit.cloud:443
VITE_LIVEKIT_API_KEY=your-api-key
VITE_LIVEKIT_API_SECRET=your-api-secret
```

Update `vite.config.js` to expose these:

```javascript
export default defineConfig({
  define: {
    'import.meta.env.VITE_LIVEKIT_URL': JSON.stringify(process.env.VITE_LIVEKIT_URL),
    'import.meta.env.VITE_LIVEKIT_API_KEY': JSON.stringify(process.env.VITE_LIVEKIT_API_KEY),
  }
})
```

---

## Step 3: VoiceContext SFU Migration

### Current Architecture (Mesh RTC)
```
User A ↔ User B ↔ User C (peer connections)
Each pair connected directly = O(N²) complexity
```

### New Architecture (SFU)
```
User A → [Livekit SFU] ← User B
User C → [Livekit SFU] (single connection each, fan-out from server)
```

### VoiceContext Changes Required

**Key differences**:
1. Instead of N-1 RTCPeerConnection, create 1 connection to SFU
2. Send 1 audio track up
3. Receive N-1 audio tracks down (relayed)
4. RNNoise processor continues working on local audio

**File**: `src/contexts/VoiceContext.jsx` (major refactor needed)

```javascript
// BEFORE (Mesh):
async joinRoom(roomId) {
  // Connect to N-1 peers
  for (let participant of otherParticipants) {
    createPeerConnection(participant.uid);
  }
}

// AFTER (SFU):
async joinRoom(roomId) {
  // 1. Get access token from Cloud Function
  const token = await getAccessToken(roomId, userId);
  
  // 2. Connect to SFU server
  await room.connect(sfuUrl, token);
  
  // 3. Publish local audio (same stream with RNNoise)
  await room.localParticipant.publishTrack(localStream.getAudioTracks()[0]);
  
  // 4. Subscribe to remote participants
  room.participants.forEach(participant => {
    participant.audioTracks.forEach(track => {
      attachRemoteStream(participant.identity, track)
    });
  });
}
```

---

## Next Action Items

### Immediate (You do this):
1. **Choose Livekit option** (A/B/C above)
2. **Get API credentials**
3. **Test connection** with curl/browser

### Then I'll do:
1. Refactor VoiceContext for SFU
2. Integrate Livekit client library
3. Test 10-person call
4. Upgrade Firebase to Blaze + deploy functions

---

## API Reference: What VoiceContext Will Use

### Livekit Room Connection
```javascript
import { connect, Room, RoomEvent, ParticipantEvent } from 'livekit-client';

const room = new Room({
  audio: true,
  video: false,
  e2ee: false
});

room.on(RoomEvent.Connected, () => {
  console.log('Connected to SFU');
});

room.on(RoomEvent.ParticipantConnected, (participant) => {
  console.log(`${participant.identity} joined`);
  participant.on(ParticipantEvent.TrackSubscribed, (track) => {
    // Audio track from SFU
    playRemoteAudio(track);
  });
});

await room.connect(livekitUrl, accessToken);
```

### Cloud Function (Get Access Token)
```javascript
// VoiceContext will call via HTTP
const token = await fetch('/api/rooms/{roomId}/token', {
  method: 'POST',
  body: JSON.stringify({ userId, identity })
}).then(r => r.json());
```

---

## Installation: Add Livekit Client

```bash
npm install livekit-client
```

---

## Troubleshooting

### "Cannot connect to SFU"
- Check WebRTC URL is correct
- Verify firewall allows UDP ports (7882, 50000-60000)
- Test with: `curl https://livekit.cloud/health`

### "Permission denied accessing audio"
- Happens inside Electron from `file://`. Already fixed (using hosted app).
- If web: Check browser microphone permissions

### "RNNoise not working with SFU"
- RNNoise processes local track BEFORE sending to SFU (still works)
- No changes needed to processor

---

## Success Criteria ✅

- [ ] Livekit instance running (health check passes)
- [ ] VoiceContext refactored to use `livekit-client`
- [ ] 2-person call works (web or desktop)
- [ ] 5-person call works with no audio dropouts
- [ ] 10-person call stable for 5+ minutes
- [ ] RNNoise suppression still active

---

## Timeline

- **Today**: Livekit setup + VoiceContext refactor (3-4 hours)
- **Next**: 10-person test + firestore rules update (1 hour)
- **Final**: Firebase Blaze upgrade + functions deploy (30 min)
- **Result**: Production-ready 10-person app

Ready to pick Livekit option (A/B/C)?
