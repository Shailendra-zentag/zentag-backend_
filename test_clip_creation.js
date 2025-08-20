import mongoose from 'mongoose';
import Clip from './src/models/Clip.js';
import { v4 as uuidv4 } from 'uuid';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/zentag-dev');
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const createTestClip = async () => {
  await connectDB();
  
  const testClip = new Clip({
    streamId: 'test-stream-ai',
    id: uuidv4(),
    clipId: uuidv4(),
    title: 'Test Clip for AI Integration',
    start_time: 60,
    end_time: 90,
    duration: 30,
    jobId: '6b84fad3-fd75-41f9-882b-02326ceac184',
    clipStatus: 'PROCESSING',
    status: 'processing',
    progress: 0
  });
  
  try {
    await testClip.save();
    console.log('Test clip created successfully:', testClip.jobId);
    console.log('Clip ID:', testClip.clipId);
  } catch (error) {
    console.error('Error creating test clip:', error);
  }
  
  mongoose.connection.close();
};

createTestClip();