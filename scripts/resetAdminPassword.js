import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Generate a unique admin ID
const generateUniqueId = () => `admin_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

const resetAdminPassword = async () => {
  let connection;
  
  try {
    console.log('Connecting to MongoDB...');
    connection = await mongoose.connect(process.env.MONGODB_URI);
    
    // Get a direct reference to the users collection for more control
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    console.log('Finding admin users...');
    const adminUsers = await usersCollection.find({ 
      role: { $in: ['admin', 'superadmin'] } 
    }).toArray();
    
    console.log(`Found ${adminUsers.length} admin users`);
    
    if (adminUsers.length === 0) {
      console.log('No admin users found. Creating a new admin user...');
      
      // Create a new admin user
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      const uniqueId = generateUniqueId();
      
      const newAdmin = {
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        password: hashedPassword,
        uid: uniqueId,
        role: 'admin',
        status: 'active',
        kycVerified: true,
        kycDocuments: {
          idCard: { url: 'placeholder' },
          proofOfAddress: { url: 'placeholder' }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await usersCollection.insertOne(newAdmin);
      console.log(`Created new admin user: admin@example.com with ID: ${result.insertedId}`);
      console.log(`Admin password is: admin123`);
      
    } else {
      console.log('Processing existing admin users:');
      
      for (const admin of adminUsers) {
        console.log(`\nResetting password for ${admin.email}`);
        
        // Generate new salt and hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('admin123', salt);
        
        // Prepare update
        const updates = { 
          password: hashedPassword,
          updatedAt: new Date()
        };
        
        // Check if uid is null or undefined, generate a new one if needed
        if (!admin.uid) {
          const uniqueId = generateUniqueId();
          updates.uid = uniqueId;
          console.log(`Setting new UID: ${uniqueId} for ${admin.email}`);
        } else {
          console.log(`Keeping existing UID: ${admin.uid} for ${admin.email}`);
        }
        
        // Update user with direct updateOne command for better control
        const updateResult = await usersCollection.updateOne(
          { _id: admin._id },
          { $set: updates }
        );
        
        console.log(`Updated ${admin.email}: ${updateResult.modifiedCount} document(s) modified`);
      }
      
      // Verify all admins now have UIDs
      const nullUidAdmins = await usersCollection.find({ 
        role: { $in: ['admin', 'superadmin'] },
        $or: [{ uid: null }, { uid: { $exists: false } }] 
      }).toArray();
      
      if (nullUidAdmins.length > 0) {
        console.log(`\nWARNING: There are still ${nullUidAdmins.length} admin users with null UIDs!`);
        
        // One more attempt to fix them with a different approach
        for (const admin of nullUidAdmins) {
          const uniqueId = generateUniqueId();
          const updateResult = await usersCollection.updateOne(
            { _id: admin._id },
            { $set: { uid: uniqueId } }
          );
          console.log(`Force updated ${admin.email} with UID: ${uniqueId} - Result: ${updateResult.modifiedCount} modified`);
        }
      } else {
        console.log('\nAll admin users now have valid UIDs');
      }
      
      console.log('\nAll admins have been updated with password: admin123');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log('\nDisconnected from MongoDB');
    }
  }
};

resetAdminPassword()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
