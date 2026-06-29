import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import bcrypt from "bcrypt";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

// Generate a unique admin ID
const generateUniqueId = () =>
  `admin_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;

const resetAdminPassword = async () => {
  let connection;

  try {
    connection = await mongoose.connect(process.env.MONGODB_URI);

    // Get a direct reference to the users collection for more control
    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");
    const adminUsers = await usersCollection
      .find({
        role: { $in: ["admin", "superadmin"] },
      })
      .toArray();

    if (adminUsers.length === 0) {
      // Create a new admin user
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash("Admin1234!", salt);
      const uniqueId = generateUniqueId();

      const newAdmin = {
        email: "admin@ffbroker.com",
        firstName: "Admin",
        lastName: "User",
        password: hashedPassword,
        uid: uniqueId,
        role: "admin",
        status: "active",
        kycVerified: true,
        kycDocuments: {
          idCard: { url: "placeholder" },
          proofOfAddress: { url: "placeholder" },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await usersCollection.insertOne(newAdmin);
    } else {

      for (const admin of adminUsers) {
        // Generate new salt and hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash("Admin1234!", salt);

        // Prepare update
        const updates = {
          password: hashedPassword,
          updatedAt: new Date(),
        };

        // Check if uid is null or undefined, generate a new one if needed
        if (!admin.uid) {
          const uniqueId = generateUniqueId();
          updates.uid = uniqueId;
        } else {
          console.log(`Keeping existing UID: ${admin.uid} for ${admin.email}`);
        }

        // Update user with direct updateOne command for better control
        const updateResult = await usersCollection.updateOne(
          { _id: admin._id },
          { $set: updates },
        );
      }

      // Verify all admins now have UIDs
      const nullUidAdmins = await usersCollection
        .find({
          role: { $in: ["admin", "superadmin"] },
          $or: [{ uid: null }, { uid: { $exists: false } }],
        })
        .toArray();

      if (nullUidAdmins.length > 0) {
        // One more attempt to fix them with a different approach
        for (const admin of nullUidAdmins) {
          const uniqueId = generateUniqueId();
          const updateResult = await usersCollection.updateOne(
            { _id: admin._id },
            { $set: { uid: uniqueId } },
          );
        }
      } else {
        console.log("\nAll admin users now have valid UIDs");
      }

      console.log("\nAll admins have been updated with password: Admin1234!");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log("\nDisconnected from MongoDB");
    }
  }
};

resetAdminPassword()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
