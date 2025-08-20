import express from 'express';
import { protect } from '../middleware/auth.js';
import Stream from '../models/Stream.js';
import {
  createStream,
  getStreams,
  getStreamById,
  updateStream,
  deleteStream,
  getStorageConfig
} from '../controllers/streams.controller.js';

const router = express.Router();

// Webhook endpoint for AI status updates (no auth required)
router.post('/webhook/ai-status', async (req, res) => {
  try {
    const { stream_id, status, message, public_hls_url, stream_url } = req.body;
    
    if (!stream_id) {
      return res.status(400).json({
        status: 'error',
        message: 'stream_id is required'
      });
    }

    // Find and update the stream
    const stream = await Stream.findOne({ streamId: stream_id });
    if (!stream) {
      return res.status(404).json({
        status: 'error',
        message: 'Stream not found'
      });
    }

    // Update stream based on AI status
    if (status === 'completed' || status === 'success') {
      stream.status = 1; // completed
      if (public_hls_url) stream.url = public_hls_url;
      if (stream_url) stream.hlsS3URL = stream_url;
    } else if (status === 'failed' || status === 'error') {
      stream.status = 4; // failed
    } else if (status === 'processing') {
      stream.status = 2; // processing
    }

    await stream.save();
    
    res.json({
      status: 'success',
      message: 'Stream status updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Protect all other routes
router.use(protect);

// Stream routes
router.route('/')
  .get(getStreams)     // GET /api/streams - Get all streams with pagination and filters
  .post(createStream); // POST /api/streams - Create a new stream (legacy endpoint)

// Create stream endpoint (matches magnifi-backend pattern)
router.post('/create', createStream); // POST /api/streams/create

// Individual stream routes
router.route('/:id')
  .get(getStreamById)    // GET /api/streams/:id - Get stream by ID
  .put(updateStream)     // PUT /api/streams/:id - Update stream
  .delete(deleteStream); // DELETE /api/streams/:id - Delete stream

// Utility routes
router.get('/config/storage', (req, res) => {
  res.json({
    status: 'success',
    data: {
      storage: getStorageConfig()
    }
  });
});

// Health check for streams service
router.get('/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'Streams service is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;