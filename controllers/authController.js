export const register = async (req, res, next) => {
  try {
    const {
      uid,
      email,
      firstName,
      lastName,
      phoneNumber,
      accountType,
      country,
      referralCode,
      dateOfBirth,
      occupation,
      address,
      city,
      postalCode,
      taxId,
      howDidYouHearAboutUs,
      experienceLevel
    } = req.body;

    // Check if required fields are provided
    if (!uid || !email || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields for registration',
        requiredFields: ['uid', 'email', 'firstName', 'lastName']
      });
    }

    // Check if user already exists
    let user = await User.findOne({ $or: [{ email }, { uid }] });

    if (user) {
      // If user exists but needs to be synced with Firebase
      logger.info(`User already exists in database, updating Firebase info: ${email}`);
      
      // Update existing user with any new information
      user.uid = uid; // Ensure UID is set
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.phoneNumber = phoneNumber || user.phoneNumber;
      user.updatedAt = new Date();
      
      // Update additional fields if provided
      if (accountType) user.accountType = accountType;
      if (country) user.country = country;
      
      // Update address info if provided
      if (address || city || postalCode || country) {
        user.address = {
          ...user.address,
          street: address || user.address?.street,
          city: city || user.address?.city,
          postalCode: postalCode || user.address?.postalCode,
          country: country || user.address?.country
        };
      }
      
      // Update additional info if provided
      if (occupation) user.occupation = occupation;
      if (dateOfBirth) user.dateOfBirth = dateOfBirth;
      if (taxId) user.taxId = taxId;
      
      await user.save();
    } else {
      // Create new user if they don't exist
      logger.info(`Creating new user: ${email}`);
      
      // Generate a unique referral code if not provided
      const generatedReferralCode = referralCode || 
        Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Create a new user
      user = new User({
        uid,
        email,
        firstName,
        lastName,
        phoneNumber,
        accountType: accountType || 'individual',
        country,
        referralCode: generatedReferralCode,
        address: {
          street: address,
          city,
          postalCode,
          country
        },
        dateOfBirth,
        occupation,
        taxId,
        howDidYouHearAboutUs,
        experienceLevel: experienceLevel || 'beginner',
        kycStatus: 'not_submitted',
        role: 'user',
        status: 'active',
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await user.save();
      
      // Process referral if a valid referral code was provided
      if (referralCode) {
        const referrer = await User.findOne({ referralCode });
        if (referrer) {
          logger.info(`Processing referral for user ${email} with referrer ${referrer.email}`);
          
          // Create referral record
          const referral = new Referral({
            referrer: referrer._id,
            referee: user._id,
            status: 'active',
            commission: 0, // Will be updated when referee makes a deposit
            createdAt: new Date()
          });
          
          await referral.save();
        }
      }
    }

    // Generate a JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiry }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        uid: user.uid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        balance: user.balance,
        referralCode: user.referralCode,
        kycStatus: user.kycStatus,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error('Error in user registration:', error);
    next(error);
  }
};