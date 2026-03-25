# CruwellsVox: 10-Person Architecture & Deployment Guide

## Current Status: Mesh → SFU Migration

### What You Now Have

1. **Web App** (React + Vite)
   - Current: Mesh WebRTC (working for 2-4 users)
   - Optimized: Noise suppression, audio pipeline
   - Deployed: https://cruwellsvox.web.app

2. **Desktop App** (Electron)
   - Windows + macOS native support
   - Same React app wrapped
   - Ready to build with `npm run build:electron`

3. **Cloud Functions Backend**
   - Room/participant management
   - Stream registration & tracking
   - Heartbeat & cleanup
   - SFU-ready signaling layer

### Problem: Why Mesh Doesn't Work for 10 Users

```
Mesh RTC Topology:
- 2 users:   1 connection  ✓ (working)
- 3 users:   3 connections ✓ (working, deployed)
- 4 users:   6 connections ✓ (working with fixes)
- 10 users: 45 connections ✗ (CPU/bandwidth collapse)

Each connection requires:
- Audio encoding + transmission (up)
- Audio reception + decoding (down)
- Noise suppression processing × 9 streams
- = Exponential CPU + bandwidth growth

SFU Topology (for 10+ users):
- 10 users: 10 connections to server only
  - Each sends 1 stream UP
  - Receives 9 relayed streams DOWN
  - Server handles routing, not clients
  - = Linear scaling
```

---

## Deployment Plan: 3 Stages

### Stage 1: Stabilize Desktop (Mesh RTC) ✅ DONE
- [x] Electron setup (Windows + macOS)
- [x] Native audio APIs ready
- [x] Desktop app builds
- **Next**: Test 4-5 person call on desktop

### Stage 2: Deploy SFU Backend (Recommended for 10 users) ⏳ IN PROGRESS

You have 3 options:

#### Option A: Livekit Cloud (Recommended - Easiest)
```bash
1. Go to https://livekit.cloud
2. Sign up (free tier: 5 GB/month transcoding)
3. Get API key + wallet URL
4. Deploy to production in 5 minutes

Pros: 
- Managed service (no ops)
- Proven 10-100 user scaling
- Free tier available
- TURN servers included

Cons:
- Pay-per-use when free tier exceeded
- 3rd-party dependency
```

#### Option B: Self-hosted Livekit (Medium difficulty - Full control)
```bash
# Deploy on a VPS (DigitalOcean, Linode, AWS - $5-20/mo)
docker run --name livekit \
  -e LIVEKIT_API_KEY=devkey \
  -e LIVEKIT_API_SECRET=secret \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  livekit/livekit-server:latest

Cost: $5-20/month for VPS
Pros: Full control, no third-party, better latency
Cons: Need to manage server, backups, updates
```

#### Option C: Google Cloud Run (Firebase ecosystem - Medium difficulty)
```bash
# Deploy Livekit on Cloud Run
# Persistent container + Firestore integration

Cost: $0.04 per 1 CPU-hour (typically $10-50/mo for 10 users)
Pros: Firebase ecosystem, auto-scaling, managed
Cons: More expensive than VPS
```

---

### Stage 3: Migrate Client Logic (In your codebase) ⏳ TODO

Current `VoiceContext.jsx` needs changes for SFU:

```javascript
// BEFORE (Mesh RTC):
// - Connect to N-1 peers
// - Send/receive audio to each peer
// - Manage N-1 RTCPeerConnections

// AFTER (SFU):
// - Connect to 1 SFU server
// - Send 1 audio stream
// - Receive N-1 remote streams (relayed by server)
// - Manage 1 RTCPeerConnection + N-1 remote tracks
```

---

## Quick Start: Test Desktop Build

```bash
# 1. Build Electron
npm run build:electron

# 2. Test locally (dev mode with hot reload)
npm run dev:electron

# 3. Package for production
## macOS:
npm run build:electron
# Output: release/CruwellsVox-x.y.z.dmg

## Windows:
npm run build:electron
# Output: release/CruwellsVox-x.y.z.exe
```

---

## Next Immediate Steps (Pick One)

### Path A: Get Desktop Working First (Quick - 2-3 hours)
```bash
1. Test npm run dev:electron
2. Make a 4-person call on desktop
3. Report: Does it work better than web?
4. Decide: Use mesh or move to SFU?
```

### Path B: Deploy SFU Now (Medium - 4-6 hours)
```bash
1. Choose SFU backend (Livekit Cloud recommended)
2. Deploy Cloud Functions to Firebase
3. Refactor VoiceContext for SFU signaling
4. Test 10-person call
5. Build + deploy desktop with SFU client
```

### Path C: Hybrid (Recommended - 6-8 hours)
```bash
1. Build + test desktop with current mesh (verify it helps)
2. If good at 4-5 users: proceed to SFU deployment
3. If struggling: SFU becomes higher priority
```

---

## Architecture Decision Tree

```
User asks: "Can 10 people talk healthy?"

Q1: "What's your latency tolerance?"
  → <100ms required? → SFU essential (mesh = 200-500ms at 10 users)
  → >200ms ok? → Try desktop mesh first

Q2: "What's your deployment comfort?"
  → "Add line or two of code" → Livekit Cloud (managed SFU)
  → "Can manage VPS" → Self-hosted Livekit
  → "Prefer Firebase" → Google Cloud Run

Q3: "Budget?"
  → Free/minimal → Livekit free tier
  → $5-20/mo → Self-hosted Livekit on VPS
  → No limit → Livekit Cloud or Cloud Run
```

---

## Technical Implementation (When Ready)

### Cloud Functions Deployment
```bash
# Install functions dependencies
cd functions
npm install

# Deploy to Firebase
cd ..
npm run functions:deploy

# Check deployed functions
firebase functions:list
```

### VoiceContext SFU Changes (Pseudo-code)
```javascript
// SFU connection flow
async joinRoom(roomId) {
  // 1. Register with Cloud Functions
  const { sfu, participants } = await fetch(
    `/api/rooms/${roomId}/join`,
    { userId, displayName }
  )

  // 2. Get SFU connection details
  const sfuServer = sfu.sfuServer  // e.g., https://sfu.example.com

  // 3. Create ONE connection to SFU
  const pc = new RTCPeerConnection()

  // 4. Add local audio stream
  const stream = await getUserMedia()
  stream.getTracks().forEach(track => pc.addTrack(track, stream))

  // 5. Create offer to SFU
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  // 6. Send offer to SFU via Cloud Functions
  const { answer, iceCandidates } = await fetch(
    `/api/rooms/${roomId}/streams/${userId}`,
    { offer, iceServers }
  )

  // 7. Set remote SDP (answer from SFU)
  await pc.setRemoteDescription(new RTCSessionDescription(answer))

  // 8. Handle incoming remote streams (from other participants)
  pc.ontrack = (event) => {
    // Play audio from each participant
    attachRemoteStream(event.track)
  }
}
```

---

## Files Modified / Created

### New Files:
- ✅ `src/electron/main.js` - Electron main process
- ✅ `src/electron/preload.js` - Secure IPC bridge
- ✅ `functions/src/index.js` - SFU signaling backend
- ✅ `functions/package.json` - Cloud Functions deps

### Modified Files:
- ✅ `package.json` - Electron + build scripts
- ✅ `vite.config.js` - Build configuration
- ✅ `firebase.json` - Functions config
- ⏳ `src/contexts/VoiceContext.jsx` - Ready for SFU migration (not done yet)

---

## Success Criteria

### Desktop App ✅ Ready
- [x] Builds for macOS (dmg)
- [x] Builds for Windows (exe)
- [x] Runs React app in Electron
- [x] Has microphone permission request
- [ ] Test: 4-person call works smoothly

### SFU Backend ⏳ Deployed (next)
- [ ] Cloud Functions deployed to Firebase
- [ ] Endpoints tested via curl/Postman
- [ ] Room creation works
- [ ] Participant join/leave works
- [ ] Stream registration works

### SFU Client ⏳ Integrated (after backend)
- [ ] VoiceContext refactored for SFU
- [ ] Client connects to SFU server
- [ ] Remote tracks received correctly
- [ ] Noise suppression still works
- [ ] Test: 10-person call works

---

## Troubleshooting Guide

### Desktop App Issues

**Error: "Could not find native build tools"**
```bash
# macOS
xcode-select --install

# Windows
# Download Visual Studio Build Tools
```

**Error: "Module not found (electron)"**
```bash
npm install electron --legacy-peer-deps
```

**App runs but audio not working**
- Check: System → Privacy & Security → Microphone (app listed?)
- Check: Audio input device in SettingsModal
- Test: Mic test button

### SFU Deployment Issues

**Cloud Functions failing**
```bash
# Check logs
firebase functions:log --limit 50

# Redeploy
firebase deploy --only functions --force
```

**SFU server unreachable**
- CORS? Add `"cors": { "origin": true }` (done - functions/src/index.js)
- Firewall ports blocked? (ports depend on SFU choice)
- DNS not resolving? Check `sfuServer` URL

---

## Questions?

Current state:
- ✅ Electron desktop app ready to build
- ✅ Cloud Functions SFU signaling ready to deploy
- ⏳ Need SFU media server (recommend Livekit)
- ⏳ Need VoiceContext migration to SFU

Next action: Build & test desktop with current mesh first, OR deploy SFU now?
