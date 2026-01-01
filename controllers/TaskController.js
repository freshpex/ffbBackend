import Task from "../models/Task.js";
import UserTask from "../models/UserTask.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Notification from "../models/Notification.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

// Helper function to create notifications
const createNotification = async (userId, title, message, type, metadata = {}, session) => {
  const notification = new Notification({
    recipient: userId,  // Changed from user to recipient
    title,
    message,
    type: mapNotificationType(type), // Map custom types to valid enum types
    data: metadata,     // Changed from metadata to data
    read: false,
  });
  
  return session ? notification.save({ session }) : notification.save();
};

// Map task notification types to valid notification types
const mapNotificationType = (taskType) => {
  const typeMap = {
    'task_started': 'info',
    'task_completed': 'success',
    'reward_claimed': 'success',
    'task_expired': 'warning',
    'task_failed': 'error'
  };
  
  return typeMap[taskType] || 'info';  // Default to 'info' if type not found
};

// Default tasks that are available in the system
const DEFAULT_TASKS = [
  {
    title: "Complete Your Profile",
    description: "Add your profile picture and complete all profile details",
    category: "profile",
    reward: 5,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      profileComplete: true,
    },
    duration: 7,
    isActive: true,
    maxCompletions: 1,
    tags: ["beginner", "profile", "onboarding"],
  },
  {
    title: "Verify Your Email",
    description: "Verify your email address to secure your account",
    category: "account",
    reward: 3,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      emailVerified: true,
    },
    duration: 3,
    isActive: true,
    maxCompletions: 1,
    tags: ["beginner", "security"],
  },
  {
    title: "Enable Two-Factor Authentication",
    description: "Add an extra layer of security to your account",
    category: "security",
    reward: 8,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      twoFactorEnabled: true,
    },
    duration: 7,
    isActive: true,
    maxCompletions: 1,
    tags: ["security", "2fa"],
  },
  {
    title: "Make Your First Deposit",
    description: "Deposit at least $50 to start trading",
    category: "deposit",
    reward: 10,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      minAmount: 50,
    },
    duration: 14,
    isActive: true,
    maxCompletions: 1,
    tags: ["beginner", "deposit", "onboarding"],
  },
  {
    title: "Follow Us on Social Media",
    description: "Follow our official social media channels for updates",
    category: "social",
    reward: 2,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      socialFollow: true,
    },
    duration: 7,
    isActive: true,
    maxCompletions: 1,
    tags: ["social", "engagement"],
  },
  {
    title: "Place Your First Order",
    description: "Place your first trading order on any market",
    category: "order",
    reward: 10,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      minAmount: 10,
      orderTypes: ["market", "limit"],
    },
    duration: 7, // 7 days to complete
    isActive: true,
    maxCompletions: 1,
    tags: ["beginner", "trading"],
  },
  {
    title: "Complete KYC Verification",
    description: "Verify your identity by completing the KYC process",
    category: "kyc",
    reward: 25,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      kycLevel: "basic",
    },
    isActive: true,
    maxCompletions: 1,
    tags: ["account", "verification"],
  },
  {
    title: "Watch Educational Video",
    description: "Watch a trading tutorial video to learn the basics",
    category: "educational",
    reward: 3,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      videoWatched: true,
    },
    duration: 7,
    isActive: true,
    maxCompletions: 1,
    tags: ["learning", "education", "beginner"],
  },
  {
    title: "Daily Login Bonus",
    description: "Log in to your account daily to earn rewards",
    category: "engagement",
    reward: 1,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      dailyLogin: true,
    },
    duration: 1,
    isActive: true,
    isRecurring: true,
    maxCompletions: 0,
    tags: ["daily", "login", "recurring"],
  },
  {
    title: "Create Your First Trading Combo",
    description: "Create a combination of at least 3 trading positions",
    category: "combo",
    reward: 30,
    rewardType: "cash",
    difficulty: "medium",
    requirements: {
      minPositions: 3,
      minDuration: 1, // At least 1 day
    },
    duration: 14, // 14 days to complete
    isActive: true,
    maxCompletions: 1,
    tags: ["trading", "strategy"],
  },
  {
    title: "Trading Volume Challenge",
    description: "Trade a total volume of $5,000 within 30 days",
    category: "trading",
    reward: 50,
    rewardType: "cash",
    difficulty: "medium",
    requirements: {
      minVolume: 5000,
    },
    duration: 30, // 30 days to complete
    isActive: true,
    maxCompletions: 1,
    tags: ["challenge", "volume"],
  },
  {
    title: "Daily Trading Streak",
    description: "Place at least one trade every day for 7 consecutive days",
    category: "trading",
    reward: 20,
    rewardType: "bonus",
    difficulty: "medium",
    requirements: {
      minDays: 7,
      consecutiveDays: true,
    },
    duration: 7, // 7 days to complete
    isActive: true,
    isRecurring: true,
    maxCompletions: 0, // Unlimited completions
    tags: ["daily", "streak"],
  },
  {
    title: "Refer 3 Friends",
    description: "Invite 3 friends who complete registration and KYC",
    category: "referral",
    reward: 75,
    rewardType: "cash",
    difficulty: "medium",
    requirements: {
      minReferrals: 3,
      requireKYC: true,
    },
    duration: 30, // 30 days to complete
    isActive: true,
    maxCompletions: 1,
    tags: ["referral", "friends"],
  },
  {
    title: "Complete 5 Educational Modules",
    description: "Learn about trading by completing 5 educational modules",
    category: "educational",
    reward: 15,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      modulesCount: 5,
    },
    duration: 14, // 14 days to complete
    isActive: true,
    maxCompletions: 1,
    tags: ["learning", "education"],
  },
  {
    title: "Deposit Challenge",
    description: "Make a deposit of $1,000 or more",
    category: "deposit",
    reward: 50,
    rewardType: "bonus",
    difficulty: "medium",
    requirements: {
      minAmount: 1000,
    },
    duration: 14, // 14 days to complete
    isActive: true,
    maxCompletions: 1,
    tags: ["deposit", "bonus"],
  },
];

// Get all available tasks
export const getAllTasks = async (req, res, next) => {
  try {
    const { category, difficulty, status } = req.query;
    const query = { isActive: true };

    if (category) {
      query.category = category;
    }
    
    if (difficulty) {
      query.difficulty = difficulty;
    }

    // Fetch tasks
    const tasks = await Task.find(query).sort({ position: 1 });

    // If there are no tasks, initialize with default tasks
    if (tasks.length === 0) {
      await Task.insertMany(DEFAULT_TASKS);
      const initializedTasks = await Task.find(query).sort({ position: 1 });
      
      return res.status(200).json({
        success: true,
        data: initializedTasks,
      });
    }

    // Get user's tasks to determine status
    let userTasks = [];
    if (req.user) {
      userTasks = await UserTask.find({ user: req.user._id });
    }

    // Combine task data with user's progress if authenticated
    const enrichedTasks = tasks.map(task => {
      const userTask = userTasks.find(ut => ut.task.toString() === task._id.toString());
      
      return {
        ...task.toObject(),
        userProgress: userTask ? {
          status: userTask.status,
          progress: userTask.progress,
          startedAt: userTask.startedAt,
          completedAt: userTask.completedAt,
          claimedAt: userTask.claimedAt,
          completionCount: userTask.completionCount,
        } : null,
      };
    });
    
    // Filter by status if requested and user is authenticated
    const filteredTasks = status && req.user 
      ? enrichedTasks.filter(task => task.userProgress && task.userProgress.status === status)
      : enrichedTasks;

    res.status(200).json({
      success: true,
      data: filteredTasks,
    });
  } catch (error) {
    logger.error("Error fetching tasks:", error);
    next(error);
  }
};

// Get a specific task by ID
export const getTaskById = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      throw new ApiError("Task not found", 404, "not_found");
    }
    
    // Get user progress if authenticated
    let userProgress = null;
    if (req.user) {
      const userTask = await UserTask.findOne({
        user: req.user._id,
        task: task._id,
      });
      
      if (userTask) {
        userProgress = {
          status: userTask.status,
          progress: userTask.progress,
          startedAt: userTask.startedAt,
          completedAt: userTask.completedAt,
          claimedAt: userTask.claimedAt,
          completionCount: userTask.completionCount,
        };
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        ...task.toObject(),
        userProgress,
      },
    });
  } catch (error) {
    logger.error(`Error fetching task ${req.params.id}:`, error);
    next(error);
  }
};

// Get user's tasks
export const getUserTasks = async (req, res, next) => {
  try {
    const { status, category } = req.query;
    const query = { user: req.user._id };
    
    if (status) {
      query.status = status;
    }
    
    // Get user's tasks with populated task details
    const userTasks = await UserTask.find(query)
      .populate({
        path: 'task',
        match: category ? { category } : {},
      })
      .sort({ updatedAt: -1 });
    
    // Filter out any tasks that didn't match the category filter
    const filteredTasks = userTasks.filter(userTask => userTask.task);
    
    res.status(200).json({
      success: true,
      data: filteredTasks,
    });
  } catch (error) {
    logger.error("Error fetching user tasks:", error);
    next(error);
  }
};

// Start a task
export const startTask = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { taskId } = req.params;
    
    // Find the task
    const task = await Task.findById(taskId).session(session);
    if (!task) {
      throw new ApiError("Task not found", 404, "not_found");
    }
    
    if (!task.isActive) {
      throw new ApiError("Task is not active", 400, "inactive_task");
    }
    
    // Check if user already has this task
    const existingUserTask = await UserTask.findOne({
      user: req.user._id,
      task: taskId,
    }).session(session);
    
    if (existingUserTask) {
      // Check if the task can be restarted
      if (!task.isRecurring && existingUserTask.status === "claimed") {
        throw new ApiError("Task already completed and claimed", 400, "already_completed");
      }
      
      // Check if maxCompletions has been reached
      if (task.maxCompletions > 0 && existingUserTask.completionCount >= task.maxCompletions) {
        throw new ApiError("Maximum completions reached", 400, "max_completions_reached");
      }
      
      // If task is in progress, just return it
      if (existingUserTask.status === "in_progress") {
        await session.commitTransaction();
        
        return res.status(200).json({
          success: true,
          message: "Task already in progress",
          data: existingUserTask,
        });
      }
      
      // Reset the task for a new attempt
      existingUserTask.status = "in_progress";
      existingUserTask.progress = 0;
      existingUserTask.startedAt = new Date();
      existingUserTask.completedAt = null;
      existingUserTask.claimedAt = null;
      
      // Set expiry date if task has a duration
      if (task.duration > 0) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + task.duration);
        existingUserTask.expiresAt = expiryDate;
      } else {
        existingUserTask.expiresAt = null;
      }
      
      await existingUserTask.save({ session });
      
      await session.commitTransaction();
      
      return res.status(200).json({
        success: true,
        message: "Task restarted successfully",
        data: existingUserTask,
      });
    }
    
    // Create new user task
    const userTask = new UserTask({
      user: req.user._id,
      task: taskId,
      status: "in_progress",
      progress: 0,
      startedAt: new Date(),
      rewardType: task.rewardType,
      rewardAmount: task.reward,
    });
    
    // Set expiry date if task has a duration
    if (task.duration > 0) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + task.duration);
      userTask.expiresAt = expiryDate;
    }
    
    await userTask.save({ session });
    
    // Create notification
    await createNotification(
      req.user._id,
      "Task Started",
      `You've started the task: ${task.title}. Complete it to earn ${task.reward} ${task.rewardType}.`,
      "task_started",
      { taskId: task._id },
      session
    );
    
    await session.commitTransaction();
    
    res.status(201).json({
      success: true,
      message: "Task started successfully",
      data: userTask,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error starting task:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Update task progress
export const updateTaskProgress = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { taskId } = req.params;
    const { progress, relatedData } = req.body;
    
    if (progress === undefined || progress < 0 || progress > 100) {
      throw new ApiError("Invalid progress value", 400, "invalid_progress");
    }
    
    // Find user task
    const userTask = await UserTask.findOne({
      user: req.user._id,
      task: taskId,
      status: "in_progress",
    }).populate("task").session(session);
    
    if (!userTask) {
      throw new ApiError("Task not found or not in progress", 404, "not_found");
    }
    
    // Check if the task is expired
    if (userTask.expiresAt && new Date() > userTask.expiresAt) {
      userTask.status = "expired";
      await userTask.save({ session });
      
      await session.commitTransaction();
      
      return res.status(400).json({
        success: false,
        message: "Task has expired",
        data: userTask,
      });
    }
    
    // Update progress
    userTask.progress = progress;
    
    // If there's related data to store
    if (relatedData) {
      userTask.relatedData = {
        ...userTask.relatedData,
        ...relatedData,
      };
    }
    
    // Check if task is completed
    if (progress >= 100) {
      userTask.status = "completed";
      userTask.completedAt = new Date();
      
      // Create notification for task completion
      await createNotification(
        req.user._id,
        "Task Completed",
        `Congratulations! You've completed the task: ${userTask.task.title}. Claim your reward now!`,
        "task_completed",
        { taskId: userTask.task._id },
        session
      );
    }
    
    await userTask.save({ session });
    
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      message: userTask.status === "completed" ? "Task completed successfully" : "Task progress updated",
      data: userTask,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error updating task progress:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Claim task reward
export const claimTaskReward = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { taskId } = req.params;
    
    // Find user task
    const userTask = await UserTask.findOne({
      user: req.user._id,
      task: taskId,
      status: "completed",
    }).populate("task").session(session);
    
    if (!userTask) {
      throw new ApiError("Completed task not found", 404, "not_found");
    }
    
    // Get user
    const user = await User.findById(req.user._id).session(session);
    
    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }
    
    // Calculate reward amount (can be modified based on performance, time, etc.)
    const rewardAmount = userTask.rewardAmount || userTask.task.reward;
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { balance: rewardAmount } },
      { 
        new: true, 
        session,
        runValidators: false
      }
    );
    
    // Create transaction record
    const transaction = new Transaction({
      user: updatedUser._id,
      type: "bonus",
      amount: rewardAmount,
      currency: "USD",
      status: "completed",
      method: "system",
      description: `Reward for completing task: ${userTask.task.title}`,
      reference: userTask._id.toString(),
      processedAt: new Date(),
      metadata: {
        taskId: userTask.task._id,
        taskTitle: userTask.task.title,
        taskCategory: userTask.task.category,
      }
    });
    
    await transaction.save({ session });
    
    // Update user task
    userTask.status = "claimed";
    userTask.claimedAt = new Date();
    userTask.transaction = transaction._id;
    userTask.completionCount += 1;
    
    await userTask.save({ session });
    
    // Create notification
    await createNotification(
      updatedUser._id,
      "Reward Claimed",
      `You've claimed ${rewardAmount} USD for completing the task: ${userTask.task.title}`,
      "reward_claimed",
      { 
        taskId: userTask.task._id,
        transactionId: transaction._id
      },
      session
    );
    
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      message: "Reward claimed successfully",
      data: {
        userTask,
        reward: {
          amount: rewardAmount,
          type: userTask.rewardType || userTask.task.rewardType,
        },
        transaction: transaction._id,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error claiming task reward:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Get task stats and metrics for the user
export const getTaskStatistics = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    // Get all user tasks
    const userTasks = await UserTask.find({ user: userId }).populate("task");
    
    // Calculate statistics
    const totalTasks = userTasks.length;
    const completedTasks = userTasks.filter(task => task.status === "completed" || task.status === "claimed").length;
    const inProgressTasks = userTasks.filter(task => task.status === "in_progress").length;
    const expiredTasks = userTasks.filter(task => task.status === "expired").length;
    
    // Calculate total earnings from tasks
    const totalEarnings = userTasks.reduce((sum, task) => {
      if (task.status === "claimed") {
        return sum + (task.rewardAmount || task.task.reward);
      }
      return sum;
    }, 0);
    
    // Calculate completion rate
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    
    // Group tasks by category
    const categoryCounts = {};
    userTasks.forEach(userTask => {
      const category = userTask.task.category;
      if (!categoryCounts[category]) {
        categoryCounts[category] = {
          total: 0,
          completed: 0,
        };
      }
      categoryCounts[category].total += 1;
      if (userTask.status === "completed" || userTask.status === "claimed") {
        categoryCounts[category].completed += 1;
      }
    });
    
    // Get available tasks count
    const availableTasksCount = await Task.countDocuments({ isActive: true });
    
    // Get tasks that will expire soon (within next 3 days)
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    
    const expiringTasksCount = userTasks.filter(task => 
      task.status === "in_progress" && 
      task.expiresAt && 
      task.expiresAt <= threeDaysFromNow
    ).length;
    
    res.status(200).json({
      success: true,
      data: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        expiredTasks,
        availableTasksCount,
        expiringTasksCount,
        totalEarnings,
        completionRate: parseFloat(completionRate.toFixed(1)),
        categoryBreakdown: categoryCounts,
      },
    });
  } catch (error) {
    logger.error("Error fetching task statistics:", error);
    next(error);
  }
};

// Admin: Create a new task
export const createTask = async (req, res, next) => {
  try {
    // Ensure user is admin
    if (req.user.role !== "admin") {
      throw new ApiError("Unauthorized", 403, "unauthorized");
    }
    
    const taskData = req.body;
    
    // Add admin as creator
    taskData.createdBy = req.user._id;
    
    // Calculate expiry date if duration is provided
    if (taskData.duration && taskData.duration > 0) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + taskData.duration);
      taskData.expiresAt = expiryDate;
    }
    
    const task = new Task(taskData);
    await task.save();
    
    res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: task,
    });
  } catch (error) {
    logger.error("Error creating task:", error);
    next(error);
  }
};

// Admin: Update a task
export const updateTask = async (req, res, next) => {
  try {
    // Ensure user is admin
    if (req.user.role !== "admin") {
      throw new ApiError("Unauthorized", 403, "unauthorized");
    }
    
    const { id } = req.params;
    const updates = req.body;
    
    // Add updater info
    updates.updatedBy = req.user._id;
    
    // Recalculate expiry date if duration is updated
    if (updates.duration !== undefined && updates.duration > 0) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + updates.duration);
      updates.expiresAt = expiryDate;
    }
    
    // Use findByIdAndUpdate with { new: true } to return the updated document
    const task = await Task.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );
    
    if (!task) {
      throw new ApiError("Task not found", 404, "not_found");
    }
    
    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: task,
    });
  } catch (error) {
    logger.error("Error updating task:", error);
    next(error);
  }
};

// Admin: Delete a task
export const deleteTask = async (req, res, next) => {
  try {
    // Ensure user is admin
    if (req.user.role !== "admin") {
      throw new ApiError("Unauthorized", 403, "unauthorized");
    }
    
    const { id } = req.params;
    
    const task = await Task.findByIdAndDelete(id);
    
    if (!task) {
      throw new ApiError("Task not found", 404, "not_found");
    }
    
    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting task:", error);
    next(error);
  }
};

// Process task completion based on events (like order placement, etc.)
export const processTaskEvent = async (userId, eventType, eventData) => {
  try {
    // Find active tasks related to this event type
    const userTasks = await UserTask.find({
      user: userId,
      status: "in_progress",
    }).populate({
      path: "task",
      match: {
        category: mapEventTypeToCategory(eventType),
        isActive: true,
      },
    });
    
    // Filter out tasks where the task field is null (due to the match condition)
    const relevantTasks = userTasks.filter(userTask => userTask.task);
    
    if (relevantTasks.length === 0) {
      return { success: false, message: "No relevant active tasks found" };
    }
    
    // Process each relevant task
    const results = await Promise.all(relevantTasks.map(async userTask => {
      // Calculate new progress based on task requirements and event data
      const newProgress = calculateTaskProgress(userTask.task, eventType, eventData, userTask);
      
      // If progress has changed, update the task
      if (newProgress > userTask.progress) {
        userTask.progress = newProgress;
        
        // Store related event data
        if (!userTask.relatedData) userTask.relatedData = {};
        userTask.relatedData[`event_${Date.now()}`] = {
          type: eventType,
          data: eventData,
          timestamp: new Date(),
        };
        
        // Check if task is now completed
        if (newProgress >= 100) {
          userTask.status = "completed";
          userTask.completedAt = new Date();
          
          // Create notification for task completion
          await createNotification(
            userId,
            "Task Completed",
            `Congratulations! You've completed the task: ${userTask.task.title}. Claim your reward now!`,
            "task_completed",
            { taskId: userTask.task._id }
          );
        }
        
        await userTask.save();
        
        return {
          taskId: userTask.task._id,
          title: userTask.task.title,
          previousProgress: userTask.progress - (newProgress - userTask.progress),
          newProgress: userTask.progress,
          completed: userTask.status === "completed",
        };
      }
      
      return {
        taskId: userTask.task._id,
        title: userTask.task.title,
        previousProgress: userTask.progress,
        newProgress: userTask.progress,
        completed: false,
        noChange: true,
      };
    }));
    
    const changedTasks = results.filter(result => !result.noChange);
    
    return {
      success: true,
      tasksUpdated: changedTasks.length,
      tasks: changedTasks,
    };
  } catch (error) {
    logger.error("Error processing task event:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Helper: Map event types to task categories
const mapEventTypeToCategory = (eventType) => {
  const mapping = {
    'order_placed': 'order',
    'order_filled': 'order',
    'order_cancelled': 'order',
    'combo_created': 'combo',
    'combo_completed': 'combo',
    'deposit_made': 'deposit',
    'withdrawal_made': 'withdrawal',
    'trade_executed': 'trading',
    'kyc_submitted': 'kyc',
    'kyc_approved': 'kyc',
    'referral_registered': 'referral',
    'referral_completed': 'referral',
    'education_started': 'educational',
    'education_completed': 'educational',
    'social_share': 'social',
    'social_follow': 'social',
  };
  
  return mapping[eventType] || eventType;
};

// Helper: Calculate task progress based on event data
const calculateTaskProgress = (task, eventType, eventData, userTask) => {
  const { requirements } = task;
  let progress = userTask.progress;
  
  switch (task.category) {
    case 'order':
      // For first order task
      if (task.maxCompletions === 1 && requirements?.minAmount) {
        const orderAmount = eventData.amount || 0;
        if (orderAmount >= requirements.minAmount) {
          progress = 100;
        } else {
          progress = Math.min(100, Math.floor((orderAmount / requirements.minAmount) * 100));
        }
      }
      // For order volume tasks
      else if (requirements?.orderVolume) {
        const currentVolume = 
          userTask.relatedData?.accumulatedVolume || 0 + (eventData.amount || 0);
        progress = Math.min(100, Math.floor((currentVolume / requirements.orderVolume) * 100));
        
        // Update accumulated volume
        if (!userTask.relatedData) userTask.relatedData = {};
        userTask.relatedData.accumulatedVolume = currentVolume;
      }
      break;
      
    case 'combo':
      if (requirements?.minPositions) {
        const positionsCount = eventData.positionsCount || 0;
        if (positionsCount >= requirements.minPositions) {
          progress = 100;
        } else {
          progress = Math.min(100, Math.floor((positionsCount / requirements.minPositions) * 100));
        }
      }
      break;
      
    case 'trading':
      if (requirements?.minVolume) {
        const currentVolume = 
          (userTask.relatedData?.accumulatedVolume || 0) + (eventData.volume || 0);
        progress = Math.min(100, Math.floor((currentVolume / requirements.minVolume) * 100));
        
        // Update accumulated volume
        if (!userTask.relatedData) userTask.relatedData = {};
        userTask.relatedData.accumulatedVolume = currentVolume;
      } else if (requirements?.minDays) {
        // For trading streak tasks
        const currentStreak = userTask.relatedData?.currentStreak || 0;
        const lastTradeDate = userTask.relatedData?.lastTradeDate;
        
        const today = new Date().toDateString();
        
        if (!lastTradeDate || new Date(lastTradeDate).toDateString() !== today) {
          const newStreak = lastTradeDate ? currentStreak + 1 : 1;
          progress = Math.min(100, Math.floor((newStreak / requirements.minDays) * 100));
          
          // Update streak data
          if (!userTask.relatedData) userTask.relatedData = {};
          userTask.relatedData.currentStreak = newStreak;
          userTask.relatedData.lastTradeDate = today;
        }
      }
      break;
      
    case 'kyc':
      if (eventType === 'kyc_approved') {
        progress = 100;
      } else if (eventType === 'kyc_submitted') {
        progress = 50;
      }
      break;
      
    case 'referral':
      if (requirements?.minReferrals) {
        const currentReferrals = eventData.totalReferrals || 0;
        progress = Math.min(100, Math.floor((currentReferrals / requirements.minReferrals) * 100));
      }
      break;
      
    case 'deposit':
      if (requirements?.minAmount) {
        const depositAmount = eventData.amount || 0;
        if (depositAmount >= requirements.minAmount) {
          progress = 100;
        } else {
          progress = Math.min(100, Math.floor((depositAmount / requirements.minAmount) * 100));
        }
      }
      break;
      
    case 'educational':
      if (requirements?.modulesCount) {
        const completedModules = eventData.completedModules || 0;
        progress = Math.min(100, Math.floor((completedModules / requirements.modulesCount) * 100));
      }
      break;
      
    default:
      // For other task types, just increment progress or set to 100 if it's a simple completion
      progress = Math.min(100, progress + 10);
  }
  
  return progress;
};

// Hook task system into various events
export const hookIntoEvents = () => {
  // This function would be called at app initialization
  // to set up event listeners for various system events
  logger.info("Task system hooked into event system");
};

export default {
  getAllTasks,
  getTaskById,
  getUserTasks,
  startTask,
  updateTaskProgress,
  claimTaskReward,
  getTaskStatistics,
  createTask,
  updateTask,
  deleteTask,
  processTaskEvent,
  hookIntoEvents,
};
