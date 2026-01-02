import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

const generateUniqueAdminId = () => {
  return `admin_${crypto.randomBytes(12).toString("hex")}`;
};

const checkAndCreateAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB Connected");

    const usersWithNullUid = await User.find({ uid: null });
    if (usersWithNullUid.length > 0) {
      console.log(
        `Found ${usersWithNullUid.length} users with null UIDs. Fixing...`,
      );

      for (const user of usersWithNullUid) {
        const newUid = generateUniqueAdminId();
        console.log(`Updating user ${user.email} with new UID: ${newUid}`);

        await User.updateOne({ _id: user._id }, { $set: { uid: newUid } });
      }
      console.log("Fixed users with null UIDs");
    }

    // Check if any admin users exist
    const adminCount = await User.countDocuments({
      role: { $in: ["admin", "superadmin"] },
    });

    if (adminCount > 0) {
      console.log(`Found ${adminCount} existing admin users`);

      // List all admin users
      const admins = await User.find({
        role: { $in: ["admin", "superadmin"] },
      }).select("email firstName lastName role uid");

      console.log("Existing admin accounts:");
      admins.forEach((admin) => {
        console.log(
          `- ${admin.email} (${admin.firstName} ${admin.lastName}, ${admin.role}) UID: ${admin.uid || "null"}`,
        );
      });

      // Create a new admin with known credentials for testing
      console.log("Creating a test admin account with known credentials...");

      const testAdminEmail = "testadmin@example.com";
      const testAdminPassword = "admin123";

      // Check if test admin already exists
      const testAdmin = await User.findOne({ email: testAdminEmail });

      if (testAdmin) {
        console.log(
          "Test admin already exists, updating password and ensuring UID is set...",
        );
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(testAdminPassword, salt);

        // Make sure this admin has a proper UID
        if (!testAdmin.uid) {
          testAdmin.uid = generateUniqueAdminId();
          console.log(
            `Setting missing UID for existing admin: ${testAdmin.uid}`,
          );
        }

        testAdmin.password = hashedPassword;
        await testAdmin.save();

        console.log(
          `Test admin account updated: ${testAdminEmail} / ${testAdminPassword}`,
        );
      } else {
        // Create test admin with explicit UID
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(testAdminPassword, salt);
        const uniqueId = generateUniqueAdminId();

        console.log(`Creating new admin with UID: ${uniqueId}`);

        try {
          const newAdmin = new User({
            firstName: "Test",
            lastName: "Admin",
            email: testAdminEmail,
            password: hashedPassword,
            uid: uniqueId, // Explicitly set UID
            role: "admin",
            status: "active",
            kycVerified: true,
            kycDocuments: {
              idCard: { url: "placeholder" },
              proofOfAddress: { url: "placeholder" },
            },
          });

          // Log the document before saving
          console.log(`About to save admin with UID: ${newAdmin.uid}`);

          await newAdmin.save();
          console.log(
            `Test admin account created successfully with UID: ${newAdmin.uid}`,
          );
        } catch (createError) {
          console.error("Error creating test admin:", createError.message);

          if (createError.code === 11000) {
            console.log(
              "Duplicate key error. Attempting with a different UID...",
            );

            // Try with a completely different approach to generate UID
            const fallbackUid = `admin_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            console.log(`Using fallback UID: ${fallbackUid}`);

            const newAdmin = new User({
              firstName: "Test",
              lastName: "Admin",
              email: testAdminEmail,
              password: hashedPassword,
              uid: fallbackUid,
              role: "admin",
              status: "active",
              kycVerified: true,
              kycDocuments: {
                idCard: { url: "placeholder" },
                proofOfAddress: { url: "placeholder" },
              },
            });

            await newAdmin.save();
            console.log(
              `Test admin account created with fallback UID: ${fallbackUid}`,
            );
          } else {
            throw createError;
          }
        }
      }

      console.log(
        `Test admin account ready: ${testAdminEmail} / ${testAdminPassword}`,
      );
    } else {
      console.log("No admin users found. Creating a new admin user...");

      // Create admin user with known credentials
      const adminEmail = "admin@example.com";
      const adminPassword = "admin123";

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);
      const adminUid = generateUniqueAdminId();

      console.log(`Creating admin with UID: ${adminUid}`);

      const adminUser = new User({
        firstName: "Admin",
        lastName: "User",
        email: adminEmail,
        password: hashedPassword,
        uid: adminUid,
        role: "admin",
        status: "active",
        kycVerified: true,
        kycDocuments: {
          idCard: { url: "placeholder" },
          proofOfAddress: { url: "placeholder" },
        },
      });

      await adminUser.save();
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

checkAndCreateAdmin();
