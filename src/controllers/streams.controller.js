import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import moment from "moment";
import path from "path";
import mongoose from "mongoose";
import Stream from "../models/Stream.js";
import logger from "../utils/logger.js";
import shortid from "shortid";
import axios from "axios";

// Configure Google Cloud Storage
const storage = new Storage({
  keyFilename: path.join(process.cwd(), "env_config/gcp-service-account.json"),
  projectId: "zeta-envoy-462108-b8",
});

const BUCKET_NAME = "gcp-mulistream-dev";
const BUCKET_REGION = "asia-south1";
const STORAGE_ENDPOINT = "https://storage.googleapis.com";
const STREAMS_FOLDER = "streams_data/";

const bucket = storage.bucket(BUCKET_NAME);

/**
 * Generate a signed URL for file upload to GCP Cloud Storage
 * @param {string} fileName - The name of the file
 * @param {string} contentType - The MIME type of the file
 * @returns {Promise<string>} - The signed URL for upload
 */
const generateUploadUrl = async (fileName, contentType = "video/mp4") => {
  const file = bucket.file(`${STREAMS_FOLDER}${fileName}`);

  const options = {
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType: contentType,
  };

  const [url] = await file.getSignedUrl(options);
  return url;
};

/**
 * Generate a public URL for accessing a file in GCP Cloud Storage
 * @param {string} fileName - The name of the file
 * @returns {string} - The public URL
 */
const generatePublicUrl = (fileName) => {
  return `${STORAGE_ENDPOINT}/${BUCKET_NAME}/${STREAMS_FOLDER}${fileName}`;
};

/**
 * Check if a file exists in GCP Cloud Storage
 * @param {string} fileName - The name of the file
 * @returns {Promise<boolean>} - Whether the file exists
 */
const fileExists = async (fileName) => {
  const file = bucket.file(`${STREAMS_FOLDER}${fileName}`);
  const [exists] = await file.exists();
  return exists;
};

// Storage configuration for compatibility
const STORAGE_CONFIG = {
  bucketName: BUCKET_NAME,
  region: BUCKET_REGION,
  endpoint: STORAGE_ENDPOINT,
  projectId: "zeta-envoy-462108-b8",
  streamsFolder: STREAMS_FOLDER,
};

/**
 * Create a new stream
 * @route POST /api/streams/create
 * @access Private
 */
export const createStream = async (req, res) => {
  try {
    const {
      title,
      url,
      category,
      userId,
      createdBy,
      createdAt,
      server_address = "default",
      recording_server = "default",
      clipsCount = 0,
      gameDate,
      isLive = false,
      videoType,
      competitionType,
      // language = '' // Removed due to MongoDB language override conflict
    } = req.body;

    // Validation
    if (!title || !url || !userId) {
      return res.status(400).json({
        status: "error",
        message: "Title, URL, and userId are required fields",
      });
    }

    // Generate unique streamId and file names
    const streamId = shortid.generate();
    const fileName = `${streamId}_${Date.now()}.mp4`;
    const thumbnailName = `${streamId}_thumbnail.jpg`;

    // Generate GCP storage URLs
    let uploadUrl = null;
    let publicUrl = null;

    try {
      uploadUrl = await generateUploadUrl(fileName);
      publicUrl = generatePublicUrl(fileName);
    } catch (storageError) {
      logger.error("Error generating storage URLs:", storageError);
      // Continue without upload URL - can be generated later if needed
    }

    // Create stream data object
    const streamData = {
      title,
      url,
      category: category || "others",
      userId,
      streamId,
      createdBy: createdBy || userId,
      createdDate: createdAt || moment().format(),
      server_address,
      recording_server,
      clipsCount,
      gameDate: gameDate || moment().format(),
      isLive,
      videoType: videoType || "",
      competitionType: competitionType || "",
      // language: language || null, // Removed due to MongoDB language override conflict

      // Default values for required fields
      entityId: userId, // Using userId as entityId for now
      categoryId: "507f1f77bcf86cd799439011", // Default ObjectId, should be replaced with actual category reference

      // Set initial status
      status: 3, // pending
      clientStatus: "processing",

      // Storage configuration
      storageName: STORAGE_CONFIG.bucketName,
      storageProvider: "gcp",
      storageRegion: BUCKET_REGION,
      storageEndpoint: STORAGE_ENDPOINT,

      // File information
      fileName: fileName,
      thumbnailName: thumbnailName,
      filePath: `${STREAMS_FOLDER}${fileName}`,
      publicUrl: publicUrl,
      uploadUrl: uploadUrl,

      // Additional default values
      aspectRatio: "16:9",
      streamBitrate: 6,
      autoIndexAudioVideo: true,
      promoCreationCount: 1,
      onAirDate: moment().format(),
      processCompleteProgress: 0,
      processingDuration: 0,
      processingStorage: 0,
      highlightConsumption: {
        highlightStorage: 0,
        highlightTime: 0,
      },

      // AI and processing flags
      autoProcessAI: false,
      isAiTaken: false,
      aiCompletionIndicator: false,

      // Stream configuration
      config: {
        storage: STORAGE_CONFIG,
      },

      // Source tracking
      source: "api_service",
    };

    // Create the stream
    const newStream = new Stream(streamData);
    const savedStream = await newStream.save();

    logger.info(`Stream created successfully: ${streamId}`, {
      streamId,
      userId,
      title,
      url,
    });

    // Call AI service to start stream processing
    try {
      const aiPayload = {
        stream_id: savedStream.streamId,
        input_type: "recorded",
        video_type: "hls",
        input_url: savedStream.url || "", // Use the stream URL or empty string
        language: "eng",
      };

      logger.info(
        `Calling AI service for stream: ${savedStream.streamId}`,
        aiPayload
      );

      const aiResponse = await axios.post(
        "http://34.14.203.238:5002/start_stream",
        aiPayload,
        {
          timeout: 30000, // 30 second timeout
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      logger.info(
        `AI service response for stream ${savedStream.streamId}:`,
        aiResponse.data
      );

      // Update stream with AI response data
      if (aiResponse.data && aiResponse.data.public_hls_url) {
        savedStream.url = aiResponse.data.public_hls_url;
        savedStream.hlsS3URL =
          aiResponse.data.stream_url || aiResponse.data.public_hls_url;
        savedStream.status = 2; // Set to processing status
        await savedStream.save();
        logger.info(
          `Stream ${savedStream.streamId} updated with AI response data`
        );
      }
    } catch (aiError) {
      logger.error(
        `AI service call failed for stream ${savedStream.streamId}:`,
        aiError.message
      );
      // Don't fail the entire request if AI service fails
      // Stream is still created, just without AI processing
    }

    res.status(201).json({
      status: "success",
      message: "Stream created successfully",
      data: {
        stream: savedStream,
        uploadUrl: uploadUrl,
        publicUrl: publicUrl,
        fileName: fileName,
        storage: {
          provider: "gcp",
          bucket: BUCKET_NAME,
          region: BUCKET_REGION,
          folder: STREAMS_FOLDER,
        },
      },
    });
  } catch (error) {
    logger.error("Error creating stream:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        status: "error",
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(409).json({
        status: "error",
        message: "Stream with this identifier already exists",
      });
    }

    res.status(500).json({
      status: "error",
      message: "Internal server error while creating stream",
    });
  }
};

/**
 * Get all streams with pagination, filters, and projection
 * @route GET /api/streams
 * @access Private
 */
export const getStreams = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      userId,
      status,
      category,
      searchText = "",
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build match query
    const matchQuery = {};

    // Filter by userId (required)
    if (userId) {
      matchQuery.userId = userId;
    }

    // Filter by status
    if (status) {
      matchQuery.status = parseInt(status);
    }

    // Filter by category (sports)
    if (category) {
      if (Array.isArray(category)) {
        matchQuery.category = { $in: category };
      } else {
        matchQuery.category = category;
      }
    }

    // Filter by title (search text)
    if (searchText && searchText.trim()) {
      matchQuery.title = { $regex: searchText.trim(), $options: "i" };
    }

    // Filter by date range
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        matchQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        matchQuery.createdAt.$lte = new Date(endDate);
      }
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build aggregation pipeline
    const pipeline = [
      { $match: matchQuery },
      { $sort: sortObj },
      {
        $facet: {
          streams: [
            { $skip: skip },
            { $limit: limitNum },
            {
              $project: {
                _id: 1,
                streamId: 1,
                title: 1,
                category: 1,
                status: 1,
                url: 1,
                hlsS3URL: 1,
                thumb_url: 1,
                defaultThumbnailUrl: 1,
                createdAt: 1,
                createdDate: 1,
                userId: 1,
                duration: 1,
                inputVideoDuration: 1,
                size: 1,
                aspectRatio: 1,
                isLive: 1,
                vod: 1,
                clipsCount: 1,
                highlightsCount: 1,
                processCompleteProgress: 1,
                processingStorage: 1,
                videoType: 1,
                competitionType: 1,
                gameDate: 1,
                onAirDate: 1,
                fireOn: 1,
                tags: 1,
                limitation: 1,
                streamAccess: 1,
                entityId: 1,
                referenceStream: 1,
                previousRecordingURLs: 1,
                isMediaLive: 1,
                mediaLiveConfig: 1,
                updatedAt: 1,
              },
            },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    // Execute aggregation
    const [result] = await Stream.aggregate(pipeline).allowDiskUse(true);

    const streams = result.streams || [];
    const total = result.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      status: "success",
      data: {
        streams,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
        filters: {
          userId,
          status,
          category,
          searchText,
          startDate,
          endDate,
          sortBy,
          sortOrder,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching streams:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error while fetching streams",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get stream by ID
 * @route GET /api/streams/:id
 * @access Private
 */
export const getStreamById = async (req, res) => {
  try {
    const { id } = req.params;

    // Log the incoming ID for debugging
    logger.debug("Fetching stream with streamId:", id);

    // Use raw MongoDB query to bypass Mongoose casting issues
    const db = mongoose.connection.db;
    const collection = db.collection("streams");

    const stream = await collection.findOne(
      { streamId: id },
      {
        projection: {
          _id: 1,
          streamId: 1,
          title: 1,
          category: 1,
          status: 1,
          url: 1,
          hlsS3URL: 1,
          thumb_url: 1,
          defaultThumbnailUrl: 1,
          createdAt: 1,
          createdDate: 1,
          userId: 1,
          duration: 1,
          inputVideoDuration: 1,
          size: 1,
          aspectRatio: 1,
          isLive: 1,
          vod: 1,
          clipsCount: 1,
          highlightsCount: 1,
          processCompleteProgress: 1,
          processingStorage: 1,
          videoType: 1,
          competitionType: 1,
          gameDate: 1,
          onAirDate: 1,
          fireOn: 1,
          tags: 1,
          limitation: 1,
          streamAccess: 1,
          entityId: 1,
          referenceStream: 1,
          previousRecordingURLs: 1,
          isMediaLive: 1,
          mediaLiveConfig: 1,
          updatedAt: 1,
        },
      }
    );

    if (!stream) {
      return res.status(404).json({
        status: "error",
        message: "Stream not found",
      });
    }

    res.json({
      status: "success",
      data: {
        stream,
      },
    });
  } catch (error) {
    logger.error("Error in getStreamById:", error.message);
    logger.error("Stack trace:", error.stack);
    logger.error("Error fetching stream:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error while fetching stream",
    });
  }
};

/**
 * Update stream
 * @route PUT /api/streams/:id
 * @access Private
 */
export const updateStream = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.streamId;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    const stream = await Stream.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!stream) {
      return res.status(404).json({
        status: "error",
        message: "Stream not found",
      });
    }

    logger.info(`Stream updated successfully: ${stream.streamId}`, {
      streamId: stream.streamId,
      updatedFields: Object.keys(updateData),
    });

    res.json({
      status: "success",
      message: "Stream updated successfully",
      data: {
        stream,
      },
    });
  } catch (error) {
    logger.error("Error updating stream:", error);

    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        status: "error",
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    res.status(500).json({
      status: "error",
      message: "Internal server error while updating stream",
    });
  }
};

/**
 * Delete stream
 * @route DELETE /api/streams/:id
 * @access Private
 */
export const deleteStream = async (req, res) => {
  try {
    const { id } = req.params;

    const stream = await Stream.findByIdAndDelete(id);

    if (!stream) {
      return res.status(404).json({
        status: "error",
        message: "Stream not found",
      });
    }

    logger.info(`Stream deleted successfully: ${stream.streamId}`, {
      streamId: stream.streamId,
      userId: stream.userId,
    });

    res.json({
      status: "success",
      message: "Stream deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting stream:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error while deleting stream",
    });
  }
};

// Export storage configuration for reference
export const getStorageConfig = () => {
  return {
    ...STORAGE_CONFIG,
    provider: "gcp",
    // Hide sensitive information
    serviceAccountPath: "env_config/gcp-service-account.json",
    keyFileConfigured: true,
  };
};

// Export helper functions for use in other modules
export { generateUploadUrl, generatePublicUrl, fileExists };
