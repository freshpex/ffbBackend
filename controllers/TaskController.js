import Task from "../models/Task.js";
import UserTask from "../models/UserTask.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Deposit from "../models/Deposit.js";
import Notification from "../models/Notification.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

// Keep certain tasks in sync with user account flags (e.g., KYC)
export const syncKycTasksForUser = async (userId, { session } = {}) => {
  if (!userId) return;

  const userQuery = User.findById(userId).select("kycVerified kycStatus");
  if (session) userQuery.session(session);
  const user = await userQuery;
  if (!user) return;

  const isApproved = user.kycVerified === true || user.kycStatus === "approved";
  const isPending = user.kycStatus === "pending";

  if (!isApproved && !isPending) return;

  const tasksQuery = Task.find({ category: "kyc", isActive: true });
  if (session) tasksQuery.session(session);
  const kycTasks = await tasksQuery;

  if (!kycTasks || kycTasks.length === 0) return;

  for (const task of kycTasks) {
    const utQuery = UserTask.findOne({ user: userId, task: task._id });
    if (session) utQuery.session(session);
    const existing = await utQuery;

    // Never downgrade or overwrite claimed tasks
    if (existing && existing.status === "claimed") continue;

    if (isApproved) {
      if (!existing) {
        const ut = new UserTask({
          user: userId,
          task: task._id,
          status: "completed",
          progress: 100,
          startedAt: new Date(),
          completedAt: new Date(),
          relatedData: { kycStatus: "approved" },
        });
        await ut.save(session ? { session } : undefined);
      } else if (existing.status !== "completed" || existing.progress < 100) {
        existing.status = "completed";
        existing.progress = 100;
        existing.completedAt = existing.completedAt || new Date();
        existing.relatedData = {
          ...(existing.relatedData || {}),
          kycStatus: "approved",
        };
        await existing.save(session ? { session } : undefined);
      }
    } else if (isPending) {
      if (!existing) {
        const ut = new UserTask({
          user: userId,
          task: task._id,
          status: "in_progress",
          progress: 50,
          startedAt: new Date(),
          relatedData: { kycStatus: "pending" },
        });
        await ut.save(session ? { session } : undefined);
      } else {
        // Only move forward
        if (existing.progress < 50) existing.progress = 50;
        if (existing.status !== "in_progress" && existing.status !== "completed") {
          existing.status = "in_progress";
        }
        existing.relatedData = {
          ...(existing.relatedData || {}),
          kycStatus: "pending",
        };
        await existing.save(session ? { session } : undefined);
      }
    }
  }
};

export const syncDepositTasksForUser = async (userId, { session } = {}) => {
  if (!userId) return;

  // Find all in-progress deposit tasks for this user
  const userTasksQuery = UserTask.find({
    user: userId,
    status: { $in: ["in_progress", "completed"] },
  }).populate({
    path: "task",
    match: { category: "deposit", isActive: true },
  });
  if (session) userTasksQuery.session(session);
  const userTasks = await userTasksQuery;

  // Filter out tasks where task is null (didn't match category)
  const depositTasks = userTasks.filter((ut) => ut.task && ut.task.requirements?.minAmount);

  if (depositTasks.length === 0) return;

  for (const userTask of depositTasks) {
    try {
      const task = userTask.task;
      const minAmount = Number(task.requirements.minAmount);

      // Calculate time window if task has duration
      let startDate = null;
      let endDate = null;
      if (task.duration && task.duration > 0 && userTask.startedAt) {
        startDate = userTask.startedAt;
        endDate = new Date(userTask.startedAt);
        endDate.setDate(endDate.getDate() + task.duration);
      }

      // Get total deposits in the time window
      const depositTotal = await getUserCompletedDepositTotal(userId, {
        session,
        startDate,
        endDate,
      });

      const progress = Math.min(
        100,
        Math.floor((Number(depositTotal || 0) / minAmount) * 100)
      );

      const shouldComplete = depositTotal >= minAmount;
      const nextStatus = shouldComplete ? "completed" : "in_progress";
      const shouldUpdateStatus = userTask.status !== nextStatus;
      const shouldUpdateProgress = progress !== userTask.progress;

      if (shouldUpdateStatus || shouldUpdateProgress) {
        userTask.progress = progress;
        userTask.status = nextStatus;
        userTask.completedAt = shouldComplete ? new Date() : null;
        userTask.relatedData = {
          ...(userTask.relatedData || {}),
          accumulatedDeposits: Number(depositTotal || 0),
        };

        if (shouldComplete && shouldUpdateStatus) {
          await createNotification(
            userId,
            "Task Completed",
            `Congratulations! You've completed the task: ${task.title}. Claim your reward now!`,
            "task_completed",
            { taskId: task._id },
            session
          );
        }

        await userTask.save(session ? { session } : undefined);
      }
    } catch (err) {
      logger.warn(`Deposit task sync error for user ${userId}: ${err.message}`);
    }
  }
};

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

const getUserCompletedDepositTotal = async (userId, { session, startDate, endDate } = {}) => {
  const matchUserId =
    typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  const depMatch = {
    user: matchUserId,
    status: "completed",
    currency: { $in: ["USD", "USDT"] },
  };

  if (startDate) depMatch.createdAt = { ...(depMatch.createdAt || {}), $gte: new Date(startDate) };
  if (endDate) depMatch.createdAt = { ...(depMatch.createdAt || {}), $lte: new Date(endDate) };

  const depQuery = Deposit.aggregate([
    { $match: depMatch },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  if (session) depQuery.session(session);
  const depAgg = await depQuery;
  const depTotal = Number(depAgg?.[0]?.total || 0);
  if (depTotal > 0) return depTotal;

  const txnMatch = {
    user: matchUserId,
    type: "deposit",
    status: "completed",
    currency: { $in: ["USD", "USDT"] },
    $nor: [
      { "metadata.action": { $in: ["refund", "early_withdrawal"] } },
      { description: { $regex: "investment", $options: "i" } },
    ],
  };
  if (startDate) txnMatch.createdAt = { ...(txnMatch.createdAt || {}), $gte: new Date(startDate) };
  if (endDate) txnMatch.createdAt = { ...(txnMatch.createdAt || {}), $lte: new Date(endDate) };

  const txnQuery = Transaction.aggregate([
    { $match: txnMatch },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  if (session) txnQuery.session(session);
  const txnAgg = await txnQuery;
  return Number(txnAgg?.[0]?.total || 0);
};

// Default tasks that are available in the system
const DEFAULT_TASKS = [
  {
    title: "Complete Your Profile",
    description: "Add your profile picture and complete all profile details",
    category: "profile",
    reward: 2,
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
    title: "Make Your First Deposit",
    description: "Deposit at least $50 to start trading",
    category: "deposit",
    reward: 10,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      minAmount: 50,
    },
    duration: 3,
    isActive: true,
    maxCompletions: 1,
    tags: ["beginner", "deposit", "onboarding"],
  },
  {
    title: "Deposit $100+",
    description: "Make a deposit of $100 or more",
    category: "deposit",
    reward: 50,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      minAmount: 100,
    },
    duration: 4,
    isActive: true,
    maxCompletions: 1,
    tags: ["deposit", "bonus"],
  },
  {
    title: "Deposit $200+",
    description: "Make a deposit of $100 or more",
    category: "deposit",
    reward: 100,
    rewardType: "cash",
    difficulty: "medium",
    requirements: {
      minAmount: 200,
    },
    duration: 5,
    isActive: true,
    maxCompletions: 1,
    tags: ["deposit", "bonus"],
  },
  {
    title: "Refer a Friend — Earn 50% of Their First Deposit",
    description: "Refer a friend who registers, completes KYC and makes their first deposit. Earn 50% of their first deposit amount as a bonus.",
    category: "referral",
    reward: 0,
    rewardType: "bonus",
    difficulty: "medium",
    requirements: {
      minReferrals: 1,
      requireKYC: true,
      requireFirstDeposit: true,
      rewardPercent: 50
    },
    duration: 30,
    isActive: true,
    isRecurring: true,
    maxCompletions: 0,
    tags: ["referral", "bonus", "first-deposit"]
  },
  {
    title: "Deposit $300+",
    description: "Make a deposit of $300 or more",
    category: "deposit",
    reward: 200,
    rewardType: "cash",
    difficulty: "medium",
    requirements: {
      minAmount: 300,
    },
    duration: 7,
    isActive: true,
    maxCompletions: 1,
    tags: ["deposit", "bonus"],
  },
  {
    title: "Deposit $500+",
    description: "Make a deposit of $500 or more",
    category: "deposit",
    reward: 300,
    rewardType: "cash",
    difficulty: "medium",
    requirements: {
      minAmount: 500,
    },
    duration: 14,
    isActive: true,
    maxCompletions: 1,
    tags: ["deposit", "bonus"],
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
    duration: 7,
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
    reward: 0.01,
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
      minDuration: 1,
    },
    duration: 14,
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
    duration: 30,
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
    duration: 7,
    isActive: true,
    isRecurring: true,
    maxCompletions: 0,
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
    duration: 30,
    isActive: true,
    maxCompletions: 1,
    tags: ["referral", "friends"],
  },
  {
    title: "Complete 15 Educational Modules",
    description: "Learn about trading by completing 5 educational modules",
    category: "educational",
    reward: 5,
    rewardType: "cash",
    difficulty: "easy",
    requirements: {
      modulesCount: 5,
    },
    duration: 14,
    isActive: true,
    maxCompletions: 1,
    tags: ["learning", "education"],
  },
  {
    title: "Deposit Challenge",
    description: "Make a deposit of $1,000 or more",
    category: "deposit",
    reward: 500,
    rewardType: "cash",
    difficulty: "medium",
    requirements: {
      minAmount: 1000,
    },
    duration: 14,
    isActive: true,
    maxCompletions: 1,
    tags: ["deposit", "bonus"],
  },
];

const DEPOSIT_TIER_TASKS = [
  {
    title: "Make Your First Deposit",
    description: "Deposit at least $50 to start trading",
    category: "deposit",
    reward: 10,
    rewardType: "cash",
    difficulty: "easy",
    requirements: { minAmount: 50 },
    duration: 14,
    isActive: true,
    maxCompletions: 1,
    tags: ["beginner", "deposit", "onboarding"],
  },
  {
    title: "Deposit $100+",
    description: "Make a deposit of $100 or more",
    category: "deposit",
    reward: 50,
    rewardType: "cash",
    difficulty: "easy",
    requirements: { minAmount: 100 },
    duration: 14,
    isActive: true,
    maxCompletions: 1,
    tags: ["deposit", "bonus"],
  },
  {
    title: "Deposit $200+",
    description: "Make a deposit of $200 or more",
    category: "deposit",
    reward: 100,
    rewardType: "cash",
    difficulty: "medium",
    requirements: { minAmount: 200 },
    duration: 14,
    isActive: true,
    maxCompletions: 1,
    tags: ["deposit", "bonus"],
  },
  {
    title: "Deposit $500+",
    description: "Make a deposit of $500 or more",
    category: "deposit",
    reward: 200,
    rewardType: "cash",
    difficulty: "medium",
    requirements: { minAmount: 500 },
    duration: 14,
    isActive: true,
    maxCompletions: 1,
    tags: ["deposit", "bonus"],
  },
  {
    title: "Deposit Challenge",
    description: "Make a deposit of $1,000 or more",
    category: "deposit",
    reward: 500,
    rewardType: "cash",
    difficulty: "medium",
    requirements: { minAmount: 1000 },
    duration: 14,
    isActive: true,
    maxCompletions: 1,
    tags: ["deposit", "bonus"],
  },
];

const ensureDepositTierTasks = async () => {
  await Promise.all(
    DEPOSIT_TIER_TASKS.map(async (task) => {
      const minAmount = task.requirements?.minAmount;
      // Upsert by title+category to be deterministic and idempotent.
      await Task.updateOne(
        { title: task.title, category: task.category },
        { $setOnInsert: { ...task, position: 0 } },
        { upsert: true },
      );

      // Backstop: if someone renamed the title, still ensure the tier exists by minAmount.
      if (typeof minAmount === "number") {
        await Task.updateOne(
          {
            category: task.category,
            "requirements.minAmount": minAmount,
          },
          { $setOnInsert: { ...task, position: 0 } },
          { upsert: true },
        );
      }
    }),
  );
};

// Get all available tasks
export const getAllTasks = async (req, res, next) => {
  try {
    const { category, difficulty, status } = req.query;
    const query = { isActive: true };
    try {
      await ensureDepositTierTasks();
    } catch (syncErr) {
      logger.warn(`Task sync warning: ${syncErr.message}`);
    }

    if (category) {
      query.category = category;
    }
    
    if (difficulty) {
      query.difficulty = difficulty;
    }

    // Fetch tasks
    const tasks = await Task.find(query).sort({ position: 1 });

    // Ensure default tasks exist — if DB has fewer tasks than our defaults, insert missing defaults
    if (tasks.length < DEFAULT_TASKS.length) {
      const existingTitles = tasks.map(t => t.title);
      const missingDefaults = DEFAULT_TASKS.filter(dt => !existingTitles.includes(dt.title));
      if (missingDefaults.length > 0) {
      await Task.insertMany(missingDefaults);
      }
      const initializedTasks = await Task.find(query).sort({ position: 1 });
      
      return res.status(200).json({
      success: true,
      data: initializedTasks,
      });
    }

    // Get user's tasks to determine status
    let userTasks = [];
    if (req.user) {
      try {
        await syncKycTasksForUser(req.user._id);
      } catch (syncErr) {
        logger.warn(`KYC task sync warning: ${syncErr.message}`);
      }
      try {
        await syncDepositTasksForUser(req.user._id);
      } catch (syncErr) {
        logger.warn(`Deposit task sync warning: ${syncErr.message}`);
      }
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

    // Ensure auto-synced tasks (like KYC) are reflected even if user never manually started them
    try {
      await syncKycTasksForUser(req.user._id);
    } catch (syncErr) {
      logger.warn(`KYC task sync warning: ${syncErr.message}`);
    }
    try {
      await syncDepositTasksForUser(req.user._id);
    } catch (syncErr) {
      logger.warn(`Deposit task sync warning: ${syncErr.message}`);
    }
    
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

    const isDepositTaskWithMin =
      task.category === "deposit" &&
      typeof task.requirements?.minAmount === "number" &&
      task.requirements.minAmount > 0;
    
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
        if (isDepositTaskWithMin) {
          const startDate = existingUserTask.startedAt || null;
          const endDate = existingUserTask.expiresAt || null;
          const depositTotal = await getUserCompletedDepositTotal(req.user._id, {
            session,
            startDate,
            endDate,
          });
          const minAmount = Number(task.requirements.minAmount);
          const progress = Math.min(
            100,
            Math.floor((Number(depositTotal || 0) / minAmount) * 100),
          );

          existingUserTask.progress = progress;
          existingUserTask.relatedData = {
            ...(existingUserTask.relatedData || {}),
            accumulatedDeposits: Number(depositTotal || 0),
          };

          if (depositTotal >= minAmount) {
            existingUserTask.progress = 100;
            existingUserTask.status = "completed";
            existingUserTask.completedAt = new Date();
          }

          await existingUserTask.save({ session });

          // Notify completion if it auto-completed on start
          if (existingUserTask.status === "completed") {
            await createNotification(
              req.user._id,
              "Task Completed",
              `Congratulations! You've completed the task: ${task.title}. Claim your reward now!`,
              "task_completed",
              { taskId: task._id },
              session,
            );
          }

          await session.commitTransaction();

          return res.status(200).json({
            success: true,
            message:
              existingUserTask.status === "completed"
                ? "Task is in progress and has been updated/completed based on your deposits"
                : "Task is in progress and progress has been refreshed",
            data: existingUserTask,
          });
        }

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

      // Deposit tasks: count previous completed deposits immediately.
      if (isDepositTaskWithMin) {
        const depositTotal = await getUserCompletedDepositTotal(req.user._id, {
          session,
        });
        const minAmount = Number(task.requirements.minAmount);
        const progress = Math.min(
          100,
          Math.floor((Number(depositTotal || 0) / minAmount) * 100),
        );

        existingUserTask.progress = progress;
        existingUserTask.relatedData = {
          ...(existingUserTask.relatedData || {}),
          accumulatedDeposits: Number(depositTotal || 0),
        };

        if (depositTotal >= minAmount) {
          existingUserTask.progress = 100;
          existingUserTask.status = "completed";
          existingUserTask.completedAt = new Date();
        }
      }
      
      // Set expiry date if task has a duration
      if (task.duration > 0) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + task.duration);
        existingUserTask.expiresAt = expiryDate;
      } else {
        existingUserTask.expiresAt = null;
      }
      
      await existingUserTask.save({ session });

      // Notify completion if it auto-completed on restart
      if (existingUserTask.status === "completed") {
        await createNotification(
          req.user._id,
          "Task Completed",
          `Congratulations! You've completed the task: ${task.title}. Claim your reward now!`,
          "task_completed",
          { taskId: task._id },
          session,
        );
      }
      
      await session.commitTransaction();
      
      return res.status(200).json({
        success: true,
        message:
          existingUserTask.status === "completed"
            ? "Task restarted and completed based on your previous deposits"
            : "Task restarted successfully",
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

    // Deposit tasks: initialize from historical completed deposits.
    if (isDepositTaskWithMin) {
      const depositTotal = await getUserCompletedDepositTotal(req.user._id, {
        session,
      });
      const minAmount = Number(task.requirements.minAmount);
      const progress = Math.min(
        100,
        Math.floor((Number(depositTotal || 0) / minAmount) * 100),
      );

      userTask.progress = progress;
      userTask.relatedData = {
        ...(userTask.relatedData || {}),
        accumulatedDeposits: Number(depositTotal || 0),
      };

      if (depositTotal >= minAmount) {
        userTask.progress = 100;
        userTask.status = "completed";
        userTask.completedAt = new Date();
      }
    }
    
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

    // If it was instantly completed (e.g., deposit total already meets requirement), notify completion.
    if (userTask.status === "completed") {
      await createNotification(
        req.user._id,
        "Task Completed",
        `Congratulations! You've completed the task: ${task.title}. Claim your reward now!`,
        "task_completed",
        { taskId: task._id },
        session,
      );
    }
    
    await session.commitTransaction();
    
    res.status(201).json({
      success: true,
      message:
        userTask.status === "completed"
          ? "Task started and completed based on your previous deposits"
          : "Task started successfully",
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
    
    if (
      userTask.task?.category === "deposit" &&
      typeof userTask.task?.requirements?.minAmount === "number"
    ) {
      const depositTotal = await getUserCompletedDepositTotal(req.user._id, {
        session,
        startDate: userTask.startedAt || null,
        endDate: userTask.expiresAt || null,
      });
      const minAmount = Number(userTask.task.requirements.minAmount);
      if (depositTotal < minAmount) {
        const progress = Math.min(
          100,
          Math.floor((Number(depositTotal || 0) / minAmount) * 100),
        );
        userTask.status = "in_progress";
        userTask.progress = progress;
        userTask.completedAt = null;
        userTask.relatedData = {
          ...(userTask.relatedData || {}),
          accumulatedDeposits: Number(depositTotal || 0),
        };
        await userTask.save({ session });

        throw new ApiError(
          "Deposit requirement not met. This task has been reset.",
          400,
          "deposit_requirement_not_met",
        );
      }
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

    // Ensure auto-synced tasks are included in stats
    try {
      await syncKycTasksForUser(userId);
    } catch (syncErr) {
      logger.warn(`KYC task sync warning: ${syncErr.message}`);
    }
    
    // Get all user tasks
    const userTasks = await UserTask.find({ user: userId }).populate("task");
    const validUserTasks = userTasks.filter((task) => task.task);
    
    // Calculate statistics
    const totalTasks = validUserTasks.length;
    const completedTasks = validUserTasks.filter(task => task.status === "completed" || task.status === "claimed").length;
    const inProgressTasks = validUserTasks.filter(task => task.status === "in_progress").length;
    const expiredTasks = validUserTasks.filter(task => task.status === "expired").length;
    
    // Calculate total earnings from tasks
    const totalEarnings = validUserTasks.reduce((sum, task) => {
      if (task.status === "claimed") {
        return sum + (task.rewardAmount || task.task.reward);
      }
      return sum;
    }, 0);
    
    // Calculate completion rate
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    
    // Group tasks by category
    const categoryCounts = {};
    validUserTasks.forEach(userTask => {
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
    
    const expiringTasksCount = validUserTasks.filter(task => 
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
    const category = mapEventTypeToCategory(eventType);

    const tasks = await Task.find({
      category,
      isActive: true,
    });

    if (!tasks || tasks.length === 0) {
      return { success: false, message: "No relevant active tasks found" };
    }

    const relevantTasks = [];
    for (const task of tasks) {
      let userTask = await UserTask.findOne({
        user: userId,
        task: task._id,
      });

      if (userTask && userTask.status === "claimed" && !task.isRecurring) {
        continue;
      }

      if (userTask && task.maxCompletions > 0 && userTask.completionCount >= task.maxCompletions) {
        continue;
      }

      if (!userTask) {
        userTask = new UserTask({
          user: userId,
          task: task._id,
          status: "in_progress",
          progress: 0,
          startedAt: new Date(),
          rewardType: task.rewardType,
          rewardAmount: task.reward,
        });

        if (task.category === "deposit" && typeof task.requirements?.minAmount === "number") {
          const startDate = task.duration > 0 ? new Date(Date.now() - task.duration * 24 * 60 * 60 * 1000) : null;
          const depositTotal = await getUserCompletedDepositTotal(userId, {
            startDate,
          });
          const minAmount = Number(task.requirements.minAmount);
          const progress = Math.min(
            100,
            Math.floor((Number(depositTotal || 0) / minAmount) * 100),
          );

          userTask.progress = progress;
          userTask.relatedData = {
            accumulatedDeposits: Number(depositTotal || 0),
          };

          if (depositTotal >= minAmount) {
            userTask.progress = 100;
            userTask.status = "completed";
            userTask.completedAt = new Date();
          }
        }

        if (task.duration > 0) {
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + task.duration);
          userTask.expiresAt = expiryDate;
        }

        await userTask.save();
      } else if (userTask.status !== "in_progress" && userTask.status !== "completed") {
        userTask.status = "in_progress";
        userTask.startedAt = new Date();
        await userTask.save();
      }

      userTask.task = task;
      relevantTasks.push(userTask);
    }

    if (relevantTasks.length === 0) {
      return { success: false, message: "No relevant active tasks to process" };
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
    'deposit_approved': 'deposit',
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
        const minAmount = Number(requirements.minAmount);
        const delta = Number(eventData.amount || 0);

        // Option C: if task is configured to use the task window, only count deposits
        // that occurred between task startedAt and expiresAt (if set).
        let includeDelta = true;
        const useWindow = !!(requirements.useTaskWindow || task.duration > 0);
        if (useWindow && userTask.startedAt) {
          const eventTime = eventData.processedAt ? new Date(eventData.processedAt) : new Date();
          if (userTask.startedAt && new Date(userTask.startedAt) > eventTime) includeDelta = false;
          if (userTask.expiresAt && new Date(userTask.expiresAt) < eventTime) includeDelta = false;
        }

        const currentTotal = Number(userTask.relatedData?.accumulatedDeposits || 0) + (includeDelta && Number.isFinite(delta) ? delta : 0);

        if (!userTask.relatedData) userTask.relatedData = {};
        userTask.relatedData.accumulatedDeposits = currentTotal;

        if (currentTotal >= minAmount) {
          progress = 100;
        } else {
          progress = Math.min(100, Math.floor((currentTotal / minAmount) * 100));
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

// For unit tests
export const __testables = {
  calculateTaskProgress,
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
