import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import cors from 'cors';

admin.initializeApp();

const corsHandler = cors({ origin: true });
const db = admin.firestore();

/**
 * SFU-Ready Cloud Functions for CruwellsVox
 * 
 * Architecture:
 * - Room host initiates connection to SFU
 * - Each participant sends ONE stream to SFU
 * - SFU relays streams to all other participants
 * - Firestore tracks room state, participants, and active streams
 * 
 * This implementation provides signaling. Actual WebRTC media forwarding
 * should be deployed on Cloud Run (Livekit, mediasoup, or janus).
 */

// ============================================================================
// ROOM MANAGEMENT
// ============================================================================

/**
 * Create or update a room
 * POST /rooms/{roomId}
 */
exports.createRoom = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    try {
      const { roomId, maxParticipants = 10, sfuServer = null } = req.body;

      if (!roomId) {
        res.status(400).send('roomId is required');
        return;
      }

      const roomData = {
        id: roomId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        maxParticipants,
        sfuServer, // URL to SFU backend (e.g., https://sfu.example.com)
        state: 'active', // active, closed
        participantCount: 0
      };

      await db.collection('rooms').doc(roomId).set(roomData, { merge: true });

      res.status(200).json({
        success: true,
        room: roomData,
        message: `Room ${roomId} created/updated. Ready for ${maxParticipants} participants.`
      });
    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Join room (participant registration)
 * POST /rooms/{roomId}/join
 * Body: { userId, displayName, audioEnabled }
 */
exports.joinRoom = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    try {
      const { roomId, userId, displayName, audioEnabled = true } = req.body;

      if (!roomId || !userId) {
        res.status(400).send('roomId and userId required');
        return;
      }

      const roomRef = db.collection('rooms').doc(roomId);
      const roomSnap = await roomRef.get();

      if (!roomSnap.exists) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      const room = roomSnap.data();
      if (room.state !== 'active') {
        res.status(403).json({ error: 'Room is not active' });
        return;
      }

      // Check participant limit
      const participantsSnap = await roomRef.collection('participants').get();
      if (participantsSnap.size >= room.maxParticipants) {
        res.status(403).json({ error: `Room is full (${room.maxParticipants} participants)` });
        return;
      }

      // Register participant
      const participantData = {
        userId,
        displayName,
        audioEnabled,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        lasHeartbeat: admin.firestore.FieldValue.serverTimestamp(),
        connectionState: 'connecting' // connecting, connected, disconnected
      };

      await roomRef.collection('participants').doc(userId).set(participantData, { merge: true });

      // Update participant count
      const participants = await roomRef.collection('participants').get();
      await roomRef.update({ participantCount: participants.size });

      // Get SFU connection info
      const sfuInfo = room.sfuServer ? { sfuServer: room.sfuServer } : null;

      res.status(200).json({
        success: true,
        participant: participantData,
        participants: participants.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        sfu: sfuInfo,
        message: `Joined room ${roomId}. You are participant ${participantsSnap.size + 1} of ${room.maxParticipants}`
      });
    } catch (error) {
      console.error('Error joining room:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Leave room
 * DELETE /rooms/{roomId}/participants/{userId}
 */
exports.leaveRoom = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'DELETE') {
      res.status(405).send('Method not allowed');
      return;
    }

    try {
      const { roomId, userId } = req.body;

      if (!roomId || !userId) {
        res.status(400).send('roomId and userId required');
        return;
      }

      const roomRef = db.collection('rooms').doc(roomId);

      // Remove participant
      await roomRef.collection('participants').doc(userId).delete();

      // Remove any streams for this participant
      await roomRef.collection('streams').doc(userId).delete();

      // Update participant count
      const participants = await roomRef.collection('participants').get();
      await roomRef.update({ participantCount: participants.size });

      res.status(200).json({
        success: true,
        message: `Left room ${roomId}`,
        remainingParticipants: participants.size
      });
    } catch (error) {
      console.error('Error leaving room:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get room info + participants
 * GET /rooms/{roomId}/info
 */
exports.getRoomInfo = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'GET') {
      res.status(405).send('Method not allowed');
      return;
    }

    try {
      const roomId = req.query.roomId || req.body.roomId;

      if (!roomId) {
        res.status(400).send('roomId required');
        return;
      }

      const roomSnap = await db.collection('rooms').doc(roomId).get();

      if (!roomSnap.exists) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      const room = roomSnap.data();
      const participantsSnap = await db.collection('rooms').doc(roomId)
        .collection('participants')
        .orderBy('joinedAt', 'asc')
        .get();

      res.status(200).json({
        room,
        participants: participantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        count: participantsSnap.size
      });
    } catch (error) {
      console.error('Error getting room info:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============================================================================
// STREAM MANAGEMENT (for SFU)
// ============================================================================

/**
 * Register media stream for participant
 * POST /rooms/{roomId}/streams/{userId}
 * Body: { offer, iceServers }
 */
exports.registerStream = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    try {
      const { roomId, userId, offer, iceServers = [] } = req.body;

      if (!roomId || !userId || !offer) {
        res.status(400).send('roomId, userId, and offer required');
        return;
      }

      const streamData = {
        userId,
        offer,
        iceServers,
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        state: 'pending' // pending, active, ended
      };

      await db.collection('rooms').doc(roomId).collection('streams').doc(userId).set(streamData);

      res.status(200).json({
        success: true,
        stream: streamData,
        message: `Stream registered for ${userId}`
      });
    } catch (error) {
      console.error('Error registering stream:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Update stream state
 * PATCH /rooms/{roomId}/streams/{userId}
 * Body: { state, answer, iceCandidates }
 */
exports.updateStream = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'PATCH' && req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    try {
      const { roomId, userId, state, answer, iceCandidates = [] } = req.body;

      if (!roomId || !userId) {
        res.status(400).send('roomId and userId required');
        return;
      }

      const updateData = {
        state: state || 'active',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (answer) updateData.answer = answer;
      if (iceCandidates.length > 0) updateData.iceCandidates = iceCandidates;

      await db.collection('rooms').doc(roomId)
        .collection('streams')
        .doc(userId)
        .update(updateData);

      res.status(200).json({
        success: true,
        message: `Stream updated for ${userId}`
      });
    } catch (error) {
      console.error('Error updating stream:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============================================================================
// HEARTBEAT & CLEANUP
// ============================================================================

/**
 * Send heartbeat (keep-alive)
 * POST /rooms/{roomId}/participants/{userId}/heartbeat
 */
exports.heartbeat = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    try {
      const { roomId, userId } = req.body;

      if (!roomId || !userId) {
        res.status(400).send('roomId and userId required');
        return;
      }

      await db.collection('rooms').doc(roomId)
        .collection('participants')
        .doc(userId)
        .update({
          lastHeartbeat: admin.firestore.FieldValue.serverTimestamp()
        });

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error sending heartbeat:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Delete stale participants (no heartbeat for 60+ seconds)
 * Triggered every 5 minutes
 */
exports.cleanupStaleParticipants = functions
  .pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    try {
      const now = Date.now();
      const staleThreshold = 60 * 1000; // 60 seconds

      const roomsSnap = await db.collection('rooms').get();

      for (const roomDoc of roomsSnap.docs) {
        const participants = await roomDoc.ref.collection('participants').get();

        for (const participant of participants.docs) {
          const lastHeartbeat = participant.data().lastHeartbeat?.toMillis() || 0;
          if (now - lastHeartbeat > staleThreshold) {
            console.log(`Removing stale participant ${participant.id} from room ${roomDoc.id}`);
            await participant.ref.delete();
          }
        }

        // Update count
        const updatedParticipants = await roomDoc.ref.collection('participants').get();
        await roomDoc.ref.update({ participantCount: updatedParticipants.size });
      }

      console.log('Cleanup completed');
    } catch (error) {
      console.error('Error in cleanup:', error);
    }
  });

/**
 * Close rooms without activity for 30+ minutes
 * Triggered every 15 minutes
 */
exports.closeInactiveRooms = functions
  .pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    try {
      const now = Date.now();
      const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

      const roomsSnap = await db.collection('rooms')
        .where('state', '==', 'active')
        .get();

      for (const room of roomsSnap.docs) {
        const lastUpdate = room.data().updatedAt?.toMillis() || room.data().createdAt?.toMillis() || 0;
        if (now - lastUpdate > inactiveThreshold) {
          console.log(`Closing inactive room ${room.id}`);
          await room.ref.update({ state: 'closed' });
        }
      }

      console.log('Room closure completed');
    } catch (error) {
      console.error('Error closing rooms:', error);
    }
  });

// ============================================================================
// HEALTH CHECK
// ============================================================================

exports.health = functions.https.onRequest((req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'CruwellsVox SFU Signaling',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});
