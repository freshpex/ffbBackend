import { validationResult, checkSchema } from 'express-validator';
import { AppError } from './errorHandler.js';

// Validation middleware to check for errors
export const validate = validations => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    
    if (errors.isEmpty()) {
      return next();
    }
    
    // Format validation errors
    const errorMessages = errors.array().map(err => ({
      field: err.path,
      message: err.msg
    }));
    
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: errorMessages
    });
  };
};

// Common validation schemas
export const schemas = {
  // User validation schemas
  user: {
    create: checkSchema({
      email: {
        isEmail: {
          errorMessage: 'Please provide a valid email address'
        },
        normalizeEmail: true,
        trim: true
      },
      firstName: {
        isLength: {
          options: { min: 2 },
          errorMessage: 'First name must be at least 2 characters long'
        },
        trim: true
      },
      lastName: {
        isLength: {
          options: { min: 2 },
          errorMessage: 'Last name must be at least 2 characters long'
        },
        trim: true
      }
    }),
    
    update: checkSchema({
      firstName: {
        optional: true,
        isLength: {
          options: { min: 2 },
          errorMessage: 'First name must be at least 2 characters long'
        },
        trim: true
      },
      lastName: {
        optional: true,
        isLength: {
          options: { min: 2 },
          errorMessage: 'Last name must be at least 2 characters long'
        },
        trim: true
      }
    })
  },
  
  // Transaction validation schemas
  transaction: {
    deposit: checkSchema({
      amount: {
        isFloat: {
          options: { min: 1 },
          errorMessage: 'Amount must be greater than 0'
        },
        toFloat: true
      },
      method: {
        isIn: {
          options: [['bitcoin', 'ethereum', 'litecoin', 'card', 'bank']],
          errorMessage: 'Invalid payment method'
        }
      }
    }),
    
    withdraw: checkSchema({
      amount: {
        isFloat: {
          options: { min: 1 },
          errorMessage: 'Amount must be greater than 0'
        },
        toFloat: true
      },
      method: {
        isIn: {
          options: [['bitcoin', 'ethereum', 'litecoin', 'bank']],
          errorMessage: 'Invalid withdrawal method'
        }
      },
      walletAddress: {
        custom: {
          options: (value, { req }) => {
            if (['bitcoin', 'ethereum', 'litecoin'].includes(req.body.method) && !value) {
              throw new Error('Wallet address is required for crypto withdrawals');
            }
            return true;
          }
        }
      }
    })
  },
  
  // Order validation schemas
  order: {
    create: checkSchema({
      symbol: {
        notEmpty: {
          errorMessage: 'Symbol is required'
        },
        trim: true
      },
      side: {
        isIn: {
          options: [['buy', 'sell']],
          errorMessage: 'Side must be buy or sell'
        }
      },
      type: {
        isIn: {
          options: [['market', 'limit', 'stop_loss', 'take_profit']],
          errorMessage: 'Invalid order type'
        }
      },
      quantity: {
        isFloat: {
          options: { gt: 0 },
          errorMessage: 'Quantity must be greater than 0'
        },
        toFloat: true
      },
      price: {
        custom: {
          options: (value, { req }) => {
            if (['limit', 'stop_limit'].includes(req.body.type) && (!value || value <= 0)) {
              throw new Error('Price must be provided and greater than 0 for limit orders');
            }
            return true;
          }
        },
        toFloat: true
      }
    })
  }
};
