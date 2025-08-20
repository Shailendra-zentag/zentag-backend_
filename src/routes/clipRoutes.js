import express from 'express';
import {
  generateClip,
  handleWebhook,
  getClips,
  getClipById,
  updateClipWithAIResponse,
  getClipProgress
} from '../controllers/clipController.js';

const router = express.Router();

// Generate new clip
router.post('/generate', generateClip);

// Webhook endpoint for AI server responses
router.post('/webhook/:clipId', handleWebhook);

// Get clips for a stream
router.get('/stream/:streamId', getClips);

// Get clip progress by job ID
router.get('/progress', getClipProgress);

// Get specific clip by ID
router.get('/:clipId', getClipById);

// Update clip with AI response data
router.put('/update/:clipId', updateClipWithAIResponse);

export default router;