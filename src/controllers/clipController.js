import Clip from '../models/Clip.js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

// Helper function to convert seconds to HH:MM:SS format
const formatTimeToHHMMSS = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const AI_SERVER_URL = 'http://34.14.203.238:5003';
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';

// Generate clip with AI server
const generateClip = async (req, res) => {
  try {
    const {
      streamId,
      title,
      startTime,
      endTime,
      speed = 1,
      rating = 1,
      tags = [],
      aspectRatio = '16:9',
      sports = '',
      streamUrl = ''
    } = req.body;

    // Validate required fields
    if (!streamId || !title || startTime === undefined || endTime === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: streamId, title, startTime, endTime'
      });
    }

    // Generate unique clip ID
    const clipId = uuidv4();
    
    // Create clip record in database
    const clipData = {
      streamId,
      id: clipId,
      clipId,
      title,
      start_time: startTime,
      end_time: endTime,
      duration: endTime - startTime,
      speed,
      rating,
      tags,
      aspectRatio,
      status: 'processing',
    };
    
    // Only set createdBy if user is authenticated
    if (req.user?.id) {
      clipData.createdBy = req.user.id;
    }
    
    const clip = new Clip(clipData);

    await clip.save();

    // Prepare payload for AI server
    const aiPayload = {
      stream_id: streamId,
      sports: sports,
      join_clip: null,
      graphics: null,
      overlay: null,
      trim_manual: {
        stream_url: streamUrl,
        start_time: formatTimeToHHMMSS(startTime),
        end_time: formatTimeToHHMMSS(endTime),
        webhook_url: `${WEBHOOK_BASE_URL}/api/clips/webhook/${clipId}`
      },
      video_urls_single_cms: '',
      webhook_url_single_cms: `${WEBHOOK_BASE_URL}/api/clips/webhook/${clipId}`,
      aspect_ratio: aspectRatio
    };

    // Send request to AI server
    try {
      const aiResponse = await axios.post(`${AI_SERVER_URL}/process_video`, aiPayload, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Update clip with job ID from AI server
      clip.jobId = aiResponse.data.job_id;
      // clip.aiServerResponse = aiResponse.data;
      await clip.save();
      console.log({aiResponse});
      res.status(200).json({
        success: true,
        message: 'Clip generation started successfully',
        data: {
          clipId: clip.clipId,
          jobId: aiResponse.data.job_id,
          status: aiResponse.data.status,
          streamId: aiResponse.data.stream_id
        }
      });

    } catch (aiError) {
      console.error('AI Server Error:', aiError.message);
      
      // Update clip status to failed
      clip.status = 'failed';
      clip.errorMessage = aiError.message;
      await clip.save();

      res.status(500).json({
        success: false,
        message: 'Failed to start clip generation',
        error: aiError.message
      });
    }

  } catch (error) {
    console.error('Generate Clip Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Webhook handler for AI server responses
const handleWebhook = async (req, res) => {
  try {
    const { clipId } = req.params;
    const webhookData = req.body;

    console.log(`Webhook received for clip ${clipId}:`, webhookData);

    // Find the clip
    const clip = await Clip.findOne({ clipId });
    if (!clip) {
      return res.status(404).json({
        success: false,
        message: 'Clip not found'
      });
    }
     console.log({webhookData});
    // Update clip based on webhook data
    if (webhookData.status === 'completed') {
      clip.status = 'completed';
      clip.progress = webhookData.percent || 100;
      clip.videoUrl = webhookData.video_url || '';
      clip.thumbnailUrl = webhookData.thumbnail || '';
      clip.thumbnails = webhookData.thumbnails || [];
    } else if (webhookData.status === 'failed') {
      clip.status = 'failed';
      clip.errorMessage = webhookData.error || 'Processing failed';
    } else if (webhookData.percent !== undefined) {
      clip.progress = Math.min(100, Math.max(0, webhookData.percent));
    }

    // Store the complete webhook response
    clip.aiServerResponse = { ...clip.aiServerResponse, ...webhookData };
    await clip.save();

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

// Get clips for a stream
const getClips = async (req, res) => {
  try {
    const { streamId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    const query = { streamId };
    if (status) {
      query.status = status;
    }

    const clips = await Clip.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Clip.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        clips,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get Clips Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clips',
      error: error.message
    });
  }
};

// Get clip by ID
const getClipById = async (req, res) => {
  try {
    const { clipId } = req.params;
    
    const clip = await Clip.findOne({ clipId });
    if (!clip) {
      return res.status(404).json({
        success: false,
        message: 'Clip not found'
      });
    }

    res.status(200).json({
      success: true,
      data: clip
    });

  } catch (error) {
    console.error('Get Clip Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clip',
      error: error.message
    });
  }
};

// Update clip with AI completion data
const updateClipWithAIResponse = async (req, res) => {
  try {
    const { clipId } = req.params;
    const aiResponse = req.body;

    console.log(`Updating clip ${clipId} with AI response:`, aiResponse);

    // Find the clip
    const clip = await Clip.findOne({ clipId });
    if (!clip) {
      return res.status(404).json({
        success: false,
        message: 'Clip not found'
      });
    }

    // Update clip with AI response data
    if (aiResponse.status === 'completed') {
      clip.status = 'completed';
      clip.progress = aiResponse.percent || 100;
      clip.videoUrl = aiResponse.video_url || '';
      clip.thumbnailUrl = aiResponse.thumbnail || '';
      clip.thumbnails = aiResponse.thumbnails || [];
    } else if (aiResponse.status === 'failed') {
      clip.status = 'failed';
      clip.errorMessage = aiResponse.error || 'Processing failed';
    } else if (aiResponse.percent !== undefined) {
      clip.progress = Math.min(100, Math.max(0, aiResponse.percent));
    }

    // Store the complete AI response
    clip.aiServerResponse = { ...clip.aiServerResponse, ...aiResponse };
    await clip.save();

    res.status(200).json({
      success: true,
      message: 'Clip updated successfully',
      data: clip
    });

  } catch (error) {
    console.error('Update Clip Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update clip',
      error: error.message
    });
  }
};

// Get clip progress by job ID
const getClipProgress = async (req, res) => {
  try {
    const { job_id } = req.query;
    
    if (!job_id) {
      return res.status(400).json({
        status: 'error',
        message: 'job_id parameter is required'
      });
    }

    // Find clip by jobId
    const clip = await Clip.findOne({ jobId: job_id });
    
    if (!clip) {
      return res.status(404).json({
        status: 'error',
        message: 'Clip not found for the provided job_id'
      });
    }

    // If clip is already completed or failed, return stored data
    if (clip.status === 'completed') {
      return res.json({
        status: 'completed',
        progress: 100,
        job_id: clip.jobId,
        video_url: clip.videoUrl,
        thumbnail: clip.thumbnailUrl,
        thumbnails: clip.thumbnails || []
      });
    }

    if (clip.status === 'failed') {
      return res.json({
        status: 'failed',
        progress: clip.progress || 0,
        job_id: clip.jobId,
        error: clip.errorMessage || 'Clip generation failed'
      });
    }

    // Fetch real-time progress from AI server
    try {
      const aiResponse = await axios.get(`${AI_SERVER_URL}/progress?job_id=${job_id}`);
      const { percent, status, thumbnail, thumbnails, video_url } = aiResponse.data;

      // Update clip progress in database
      clip.progress = percent;
      
      // If completed (100%), update clip with final data
      if (percent === 100 && status === 'completed') {
        clip.status = 'completed';
        clip.videoUrl = video_url;
        clip.thumbnailUrl = thumbnail;
        clip.thumbnails = thumbnails || [];
        
        await clip.save();
        
        return res.json({
          status: 'completed',
          progress: 100,
          job_id: clip.jobId,
          video_url: video_url,
          thumbnail: thumbnail,
          thumbnails: thumbnails || []
        });
      }
      
      // If failed
      if (status === 'failed') {
        clip.status = 'failed';
        clip.errorMessage = 'AI processing failed';
        await clip.save();
        
        return res.json({
          status: 'failed',
          progress: percent,
          job_id: clip.jobId,
          error: 'AI processing failed'
        });
      }
      
      // Save progress update
      await clip.save();
      
      // Return current progress
      return res.json({
        status: 'processing',
        progress: percent,
        job_id: clip.jobId
      });
      
    } catch (aiError) {
      logger.error('Error fetching progress from AI server:', aiError);
      
      // Fallback to stored progress if AI server is unreachable
      const currentStatus = clip.status === 'completed' ? 'completed' : 
                           clip.status === 'failed' ? 'failed' : 'processing';
      
      const response = {
        status: currentStatus,
        progress: clip.progress || 0,
        job_id: clip.jobId
      };
      
      if (currentStatus === 'completed') {
        response.video_url = clip.videoUrl;
        response.thumbnail = clip.thumbnailUrl;
        response.thumbnails = clip.thumbnails || [];
      }
      
      if (currentStatus === 'failed') {
        response.error = clip.errorMessage || 'Clip generation failed';
      }
      
      return res.json(response);
    }
    
  } catch (error) {
    logger.error('Error getting clip progress:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

export {
  generateClip,
  handleWebhook,
  getClips,
  getClipById,
  updateClipWithAIResponse,
  getClipProgress
};