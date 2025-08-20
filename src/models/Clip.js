import mongoose from 'mongoose';

const clipSchema = new mongoose.Schema({
  streamId: {
    type: String,
    required: true,
    index: true
  },
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  clipId: {
    type: String,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  start_time: {
    type: Number,
    required: true
  },
  end_time: {
    type: Number,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  speed: {
    type: Number,
    default: 1
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 1
  },
  tags: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed', 'cancelled'],
    default: 'processing'
  },
  jobId: {
    type: String,
    index: true
  },
  videoUrl: {
    type: String
  },
  s3_thumb_url: {
    type: String
  },
  thumbnailUrl: {
    type: String
  },
  thumbnails: {
    type: [String],
    default: []
  },
  aspectRatio: {
    type: String,
    default: '16:9'
  },
  customData: {
    type: Object,
    default: {}
  },
  clipData: {
    type: Object,
    default: {}
  },
  events: {
    type: [Object],
    default: []
  },
  aiServerResponse: {
    type: Object,
    default: {}
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  errorMessage: {
    type: String
  },
  userId: {
    type: String
  },
  projectId: {
    type: String
  },
  parentHighlightId: {
    type: mongoose.Schema.Types.ObjectId
  },
  entityId: {
    type: String
  },
  clipLanguage: {
    type: String
  },
  aiEnhanceStartTime: {
    type: Number
  },
  tracks: {
    type: [Object],
    default: []
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, {
  timestamps: true
});

// Index for efficient queries
clipSchema.index({ streamId: 1, createdAt: -1 });
clipSchema.index({ jobId: 1 });
clipSchema.index({ status: 1 });

export default mongoose.model('Clip', clipSchema);