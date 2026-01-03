import mongoose from "mongoose";
import Task from "../models/Task.js";
import config from "../config/config.js";

/**
 * Seed shopping tasks into the database
 */
async function seedShoppingTasks() {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(config.db.uri || config.mongodb?.uri);
    console.log("Connected successfully");

    const shoppingTasks = [
      {
        title: "First Shop Purchase",
        description:
          "Make your first shop purchase and get 200% cashback! Browse our store, add items to cart, and complete your order.",
        category: "shopping",
        reward: 10,
        rewardType: "bonus",
        difficulty: "easy",
        requirements: {
          minAmount: 5,
          orderCount: 1,
        },
        maxCompletions: 1,
        isActive: true,
        image: "🛍️",
        tags: ["shop", "purchase", "beginner", "cashback"],
        position: 1,
      },
      {
        title: "Shop Explorer",
        description:
          "Complete 3 shop purchases this week. Each purchase gives 200% cashback automatically!",
        category: "shopping",
        reward: 25,
        rewardType: "cash",
        difficulty: "medium",
        requirements: {
          orderCount: 3,
          minAmount: 10,
        },
        duration: 7,
        isRecurring: true,
        maxCompletions: 0,
        isActive: true,
        image: "🛒",
        tags: ["shop", "weekly", "cashback"],
        position: 2,
      },
      {
        title: "Big Spender",
        description:
          "Make a single shop purchase of $50 or more. Get 200% cashback + extra $30 bonus!",
        category: "shopping",
        reward: 30,
        rewardType: "bonus",
        difficulty: "medium",
        requirements: {
          minAmount: 50,
          orderCount: 1,
        },
        maxCompletions: 0,
        isRecurring: true,
        isActive: true,
        image: "💰",
        tags: ["shop", "premium", "cashback"],
        position: 3,
      },
      {
        title: "Shop VIP",
        description:
          "Complete 10 shop purchases total. Unlock VIP status + $50 bonus. Remember: Every purchase gives 200% cashback!",
        category: "shopping",
        reward: 50,
        rewardType: "cash",
        difficulty: "hard",
        requirements: {
          orderCount: 10,
          minAmount: 5,
        },
        maxCompletions: 1,
        isActive: true,
        image: "👑",
        tags: ["shop", "milestone", "vip", "cashback"],
        position: 4,
      },
      {
        title: "Fashion Shopper",
        description:
          "Purchase any clothing item from our shop. Get 200% cashback + $15 fashion bonus!",
        category: "shopping",
        reward: 15,
        rewardType: "bonus",
        difficulty: "easy",
        requirements: {
          category: "clothing",
          orderCount: 1,
        },
        maxCompletions: 0,
        isRecurring: true,
        isActive: true,
        image: "👕",
        tags: ["shop", "clothing", "fashion", "cashback"],
        position: 5,
      },
      {
        title: "Tech Enthusiast",
        description:
          "Buy any electronics from our store. Enjoy 200% cashback + $20 tech bonus!",
        category: "shopping",
        reward: 20,
        rewardType: "bonus",
        difficulty: "medium",
        requirements: {
          category: "electronics",
          orderCount: 1,
        },
        maxCompletions: 0,
        isRecurring: true,
        isActive: true,
        image: "📱",
        tags: ["shop", "electronics", "tech", "cashback"],
        position: 6,
      },
      {
        title: "Daily Shopper",
        description:
          "Make a shop purchase every day for 5 days in a row. Each purchase gives 200% cashback + $40 streak bonus!",
        category: "shopping",
        reward: 40,
        rewardType: "cash",
        difficulty: "hard",
        requirements: {
          consecutiveDays: 5,
          minAmount: 5,
        },
        maxCompletions: 0,
        isRecurring: true,
        isActive: true,
        image: "🔥",
        tags: ["shop", "streak", "daily", "cashback"],
        position: 7,
      },
      {
        title: "Cart Filler",
        description:
          "Add 5 or more items to your cart and complete the purchase. Get 200% cashback + $25 bonus!",
        category: "shopping",
        reward: 25,
        rewardType: "bonus",
        difficulty: "medium",
        requirements: {
          minItems: 5,
          orderCount: 1,
        },
        maxCompletions: 0,
        isRecurring: true,
        isActive: true,
        image: "🛍️",
        tags: ["shop", "bulk", "cashback"],
        position: 8,
      },
    ];

    console.log("Clearing existing shopping tasks...");
    await Task.deleteMany({ category: "shopping" });

    console.log("Creating shopping tasks...");
    const result = await Task.insertMany(shoppingTasks);

    console.log(`✅ Successfully created ${result.length} shopping tasks!`);
    console.log("\nCreated tasks:");
    result.forEach((task) => {
      console.log(
        `- ${task.title} (${task.difficulty}) - $${task.reward} ${task.rewardType}`,
      );
    });

    process.exit(0);
  } catch (error) {
    console.error("Error seeding shopping tasks:", error);
    process.exit(1);
  }
}

seedShoppingTasks();
