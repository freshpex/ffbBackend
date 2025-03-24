import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'superadmin'],
      default: 'user',
    },
    balance: {
      type: Number,
      default: 0,
    },
    kycVerified: {
      type: Boolean,
      default: false,
    },
    kycDocuments: {
      idCard: {
        url: String,
        verified: { type: Boolean, default: false },
      },
      proofOfAddress: {
        url: String,
        verified: { type: Boolean, default: false },
      },
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: String,
      default: null,
    },
    referralEarnings: {
      type: Number,
      default: 0,
    },
    totalDeposited: {
      type: Number,
      default: 0,
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
    },
    tradingEnabled: {
      type: Boolean,
      default: true,
    },
    apiKeys: [
      {
        name: String,
        key: String,
        secret: String,
        permissions: [String],
        active: Boolean,
      },
    ],
    settings: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      twoFactorAuth: {
        type: Boolean,
        default: false,
      },
    },
  },
  { timestamps: true }
);

// Static method to synchronize Firebase user
UserSchema.statics.syncFirebaseUser = async function(uid, email, displayName = '') {
  try {
    // Find user by uid or email
    let user = await this.findOne({ $or: [{ uid }, { email }] });
    
    if (user) {
      // User exists - update if needed
      let updates = {};
      
      // If found by email but uid doesn't match, update uid
      if (user.uid !== uid) {
        updates.uid = uid;
      }
      
      // If displayName is provided, parse it
      if (displayName && displayName.includes(' ')) {
        const [firstName, ...lastNameParts] = displayName.split(' ');
        const lastName = lastNameParts.join(' ');
        
        if (user.firstName !== firstName) updates.firstName = firstName;
        if (user.lastName !== lastName) updates.lastName = lastName;
      }
      
      // If there are updates, apply them
      if (Object.keys(updates).length > 0) {
        Object.assign(user, updates);
        await user.save();
      }
      
      return { user, isNew: false, updated: Object.keys(updates).length > 0 };
    }
    
    // User not found, create new user
    let firstName = 'User';
    let lastName = '';
    
    if (displayName && displayName.includes(' ')) {
      const nameParts = displayName.split(' ');
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }
    
    // Generate referral code
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Create new user
    const newUser = new this({
      uid,
      email,
      firstName,
      lastName,
      referralCode
    });
    
    await newUser.save();
    
    return { user: newUser, isNew: true, updated: false };
  } catch (error) {
    throw error;
  }
};

export default mongoose.model('User', UserSchema);
