import express from 'express';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Protect all routes
router.use(protect);

// Basic dashboard routes (to be expanded)
router.get('/stats', (req, res) => {
  res.json({
    status: 'success',
    message: 'Dashboard stats - coming soon',
    data: {
      totalVideos: 0,
      totalViews: 0,
      totalLikes: 0,
      storageUsed: 0
    }
  });
});

export default router;
