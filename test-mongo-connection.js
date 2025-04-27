import dotenv from "dotenv";
import mongoose from "mongoose";

// Load environment variables
dotenv.config();

console.log("Environment variables loaded");
console.log(
  "MONGO_URI:",
  process.env.MONGO_URI ? "is defined" : "is NOT defined",
);

if (process.env.MONGO_URI) {
  console.log("Attempting to connect to MongoDB...");

  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      console.log("MongoDB connected successfully!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("MongoDB connection error:", err);
      process.exit(1);
    });
} else {
  console.error("MONGO_URI is not defined in environment variables");
  process.exit(1);
}
