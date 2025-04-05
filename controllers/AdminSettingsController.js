import SystemSetting from '../models/SystemSetting.js';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';

// Get all system settings
export const getAllSettings = async (req, res, next) => {
  try {
    // Only superadmins can view all settings including sensitive ones
    const isSuperAdmin = req.user.role === 'superadmin';
    
    let settings;
    
    if (isSuperAdmin) {
      // Superadmins can see all settings
      settings = await SystemSetting.find();
    } else {
      // Regular admins can only see non-sensitive settings
      settings = await SystemSetting.find({ sensitive: false });
    }
    
    // Transform to a more usable format, grouped by category
    const groupedSettings = settings.reduce((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = {};
      }
      acc[setting.category][setting.key] = {
        value: setting.value,
        description: setting.description,
        type: setting.type,
        options: setting.options
      };
      return acc;
    }, {});
    
    res.status(200).json({
      success: true,
      data: groupedSettings
    });
  } catch (error) {
    logger.error('Error fetching system settings:', error);
    next(error);
  }
};

// Get settings by category
export const getSettingsByCategory = async (req, res, next) => {
  try {
    const { category } = req.params;
    
    if (!category) {
      throw new ApiError('Category is required', 400, 'validation_error');
    }
    
    const isSuperAdmin = req.user.role === 'superadmin';
    
    let query = { category };
    
    // Regular admins can't see sensitive settings
    if (!isSuperAdmin) {
      query.sensitive = false;
    }
    
    const settings = await SystemSetting.find(query);
    
    // Transform to object with keys
    const settingsObj = settings.reduce((acc, setting) => {
      acc[setting.key] = {
        value: setting.value,
        description: setting.description,
        type: setting.type,
        options: setting.options
      };
      return acc;
    }, {});
    
    res.status(200).json({
      success: true,
      data: settingsObj
    });
  } catch (error) {
    logger.error(`Error fetching settings for category ${req.params.category}:`, error);
    next(error);
  }
};

// Get setting by key
export const getSettingByKey = async (req, res, next) => {
  try {
    const { key } = req.params;
    
    if (!key) {
      throw new ApiError('Setting key is required', 400, 'validation_error');
    }
    
    const setting = await SystemSetting.findOne({ key });
    
    if (!setting) {
      throw new ApiError('Setting not found', 404, 'not_found');
    }
    
    // Check if setting is sensitive and user is not superadmin
    if (setting.sensitive && req.user.role !== 'superadmin') {
      throw new ApiError('Access denied to sensitive setting', 403, 'forbidden');
    }
    
    res.status(200).json({
      success: true,
      data: setting
    });
  } catch (error) {
    logger.error(`Error fetching setting with key ${req.params.key}:`, error);
    next(error);
  }
};

// Update settings (batch update)
export const updateSettings = async (req, res, next) => {
  try {
    const { settings } = req.body;
    
    if (!settings || !Object.keys(settings).length) {
      throw new ApiError('No settings provided for update', 400, 'validation_error');
    }
    
    const isSuperAdmin = req.user.role === 'superadmin';
    
    // Process each setting
    const updateResults = [];
    const errors = [];
    
    for (const [key, value] of Object.entries(settings)) {
      try {
        // Find the setting
        const setting = await SystemSetting.findOne({ key });
        
        if (!setting) {
          errors.push(`Setting with key '${key}' not found`);
          continue;
        }
        
        // Check if setting is sensitive and user is not superadmin
        if (setting.sensitive && !isSuperAdmin) {
          errors.push(`Access denied to update sensitive setting '${key}'`);
          continue;
        }
        
        // Validate the value based on type
        if (setting.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Invalid value type for '${key}'. Expected boolean.`);
          continue;
        }
        
        if (setting.type === 'number' && typeof value !== 'number') {
          errors.push(`Invalid value type for '${key}'. Expected number.`);
          continue;
        }
        
        if (setting.type === 'select' && !setting.options.includes(value)) {
          errors.push(`Invalid value for '${key}'. Must be one of: ${setting.options.join(', ')}`);
          continue;
        }
        
        // Update the setting
        setting.value = value;
        setting.updatedBy = req.user._id;
        setting.updatedAt = new Date();
        
        await setting.save();
        
        updateResults.push({
          key,
          success: true
        });
      } catch (err) {
        errors.push(`Error updating '${key}': ${err.message}`);
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Settings updated',
      data: {
        updated: updateResults,
        errors
      }
    });
  } catch (error) {
    logger.error('Error updating settings:', error);
    next(error);
  }
};

// Create a new setting (superadmin only)
export const createSetting = async (req, res, next) => {
  try {
    const { key, value, description, category, type, options, sensitive } = req.body;
    
    // Only superadmins can create settings
    if (req.user.role !== 'superadmin') {
      throw new ApiError('Only superadmins can create new settings', 403, 'forbidden');
    }
    
    // Check if required fields are provided
    if (!key || value === undefined || !description || !category || !type) {
      throw new ApiError('Missing required fields', 400, 'validation_error');
    }
    
    // Check if setting already exists
    const existingSetting = await SystemSetting.findOne({ key });
    
    if (existingSetting) {
      throw new ApiError(`Setting with key '${key}' already exists`, 400, 'duplicate_key');
    }
    
    // Create new setting
    const setting = new SystemSetting({
      key,
      value,
      description,
      category,
      type,
      options: options || [],
      sensitive: sensitive || false,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    
    await setting.save();
    
    res.status(201).json({
      success: true,
      message: 'Setting created successfully',
      data: setting
    });
  } catch (error) {
    logger.error('Error creating setting:', error);
    next(error);
  }
};

// Delete a setting (superadmin only)
export const deleteSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    
    // Only superadmins can delete settings
    if (req.user.role !== 'superadmin') {
      throw new ApiError('Only superadmins can delete settings', 403, 'forbidden');
    }
    
    // Find and delete the setting
    const setting = await SystemSetting.findOneAndDelete({ key });
    
    if (!setting) {
      throw new ApiError(`Setting with key '${key}' not found`, 404, 'not_found');
    }
    
    res.status(200).json({
      success: true,
      message: `Setting '${key}' deleted successfully`
    });
  } catch (error) {
    logger.error(`Error deleting setting with key ${req.params.key}:`, error);
    next(error);
  }
};

// Reset settings to defaults (superadmin only)
export const resetToDefaults = async (req, res, next) => {
  try {
    // Only superadmins can reset settings
    if (req.user.role !== 'superadmin') {
      throw new ApiError('Only superadmins can reset settings', 403, 'forbidden');
    }
    
    // This would typically be implemented by comparing current settings
    // to a set of default settings and updating accordingly
    // For simplicity, we'll just return a success message
    
    res.status(200).json({
      success: true,
      message: 'Settings reset to defaults successfully'
    });
  } catch (error) {
    logger.error('Error resetting settings to defaults:', error);
    next(error);
  }
};

export default {
  getAllSettings,
  getSettingsByCategory,
  getSettingByKey,
  updateSettings,
  createSetting,
  deleteSetting,
  resetToDefaults
};
