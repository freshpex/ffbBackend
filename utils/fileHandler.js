import fs from 'fs';
import logger from '../middleware/logger.js';

export const ensureUploadDir = (dirPath) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.info(`Created temporary directory: ${dirPath}`);
      }
      return true;
    } else {
      // In development, ensure the uploads directory exists
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.info(`Created upload directory: ${dirPath}`);
      }
      return true;
    }
  } catch (error) {
    logger.error(`Failed to create directory ${dirPath}:`, error);
    return false;
  }
};

/**
 * For serverless environments, you should implement cloud storage
 * integration here, like S3, Firebase Storage, etc.
 * 
 * Example:
 * export const uploadToCloudStorage = async (localFilePath, destinationPath) => {
 *   // Upload to cloud storage
 * }
 */
