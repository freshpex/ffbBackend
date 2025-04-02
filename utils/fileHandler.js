import fs from 'fs';
import path from 'path';
import logger from '../middleware/logger.js';

/**
 * Ensures that a directory exists, creating it if it doesn't
 * @param {string} dirPath - Path to the directory
 * @returns {boolean} - True if directory exists or was created
 */
export const ensureUploadDir = (dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.info(`Created directory: ${dirPath}`);
    }
    return true;
  } catch (error) {
    logger.error(`Error creating directory ${dirPath}:`, error);
    return false;
  }
};

/**
 * Removes a file if it exists
 * @param {string} filePath - Path to the file
 * @returns {boolean} - True if file was removed or didn't exist
 */
export const removeFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Removed file: ${filePath}`);
    }
    return true;
  } catch (error) {
    logger.error(`Error removing file ${filePath}:`, error);
    return false;
  }
};

export default {
  ensureUploadDir,
  removeFile
};
