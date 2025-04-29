import Mailjet from 'node-mailjet';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import config from '../config/config.js';
import logger from '../middleware/logger.js';
  
// Initialize Mailjet client
const mailjet = Mailjet.apiConnect(
  process.env.MAILJET_API_KEY,
  process.env.MAILJET_SECRET_KEY
);

// Send email function
export const sendEmail = async ({ to, subject, templateName, context }) => {
  try {
    // Make sure we have a valid recipient
    if (!to) {
      throw new Error('Recipient email is required');
    }
    
    const template = templateName || 'notification';
    
    // Compile template with context
    const html = loadTemplate(template)({
      subject,
      title: context.title || subject,
      message: context.message,
      ...context
    });
    
    // Format recipients for Mailjet
    const recipients = Array.isArray(to) 
      ? to.map(email => ({ Email: email }))
      : [{ Email: to }];
    
    // Send the email using Mailjet's API
    const response = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: config.email.fromAddress || config.email.user,
            Name: config.email.fromName || 'FFB Finance'
          },
          To: recipients,
          Subject: subject,
          HTMLPart: html
        }
      ]
    });
    
    logger.info(`Email sent to ${to}: ${response.body.Messages[0].Status}`);
    return response.body;
  } catch (error) {
    logger.error(`Error sending email to ${to}:`, error);
    throw error;
  }
};

// Helper function to load and compile email templates
const loadTemplate = (templateName) => {
  try {
    // Resolve template path
    const templatePath = path.resolve(`./templates/emails/${templateName}.html`);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(templatePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      const template = getDefaultTemplate(templateName);
      fs.writeFileSync(templatePath, template);
    }
    
    // Read the template file
    const template = fs.readFileSync(templatePath, 'utf8');
    
    // Compile the template
    return handlebars.compile(template);
  } catch (error) {
    logger.error(`Error loading email template ${templateName}:`, error);
    // Return a simple template as fallback
    return handlebars.compile('{{message}}');
  }
};

// Get default template by name
const getDefaultTemplate = (templateName) => {
  // Common CSS styles for all templates
  const commonStyles = `
    body { 
      font-family: 'Segoe UI', Arial, sans-serif; 
      line-height: 1.6; 
      color: #333; 
      margin: 0;
      padding: 0;
      background-color: #f9f9f9;
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background-color: #fff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 10px rgba(0,0,0,0.05);
    }
    .header { 
      background: linear-gradient(135deg, #0066cc, #004080); 
      color: white; 
      padding: 20px; 
      text-align: center;
    }
    .logo {
      max-height: 50px;
      margin-bottom: 10px;
    }
    .content { 
      padding: 30px; 
      background: white;
    }
    .footer { 
      margin-top: 20px; 
      padding: 15px;
      font-size: 12px; 
      color: #666; 
      text-align: center; 
      background-color: #f5f5f5;
      border-top: 1px solid #eeeeee;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #0066cc;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-weight: bold;
      margin: 20px 0;
      text-align: center;
      transition: background-color 0.2s;
    }
    .button:hover {
      background-color: #0055aa;
    }
    .info-box {
      background-color: #f5f7fa;
      border-left: 4px solid #0066cc;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .alert-box {
      background-color: #fff8f8;
      border-left: 4px solid #cc0000;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .success-box {
      background-color: #f0fff0;
      border-left: 4px solid #00cc66;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th {
      background-color: #f5f7fa;
    }
    @media only screen and (max-width: 620px) {
      .container {
        width: 100% !important;
        border-radius: 0;
      }
      .content {
        padding: 20px;
      }
    }
  `;

  // Base template structure
  const baseTemplate = (content) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{subject}}</title>
    <style>
      ${commonStyles}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://ffbfinance.com/logo.png" alt="FFB Finance" class="logo" />
        <h2>{{title}}</h2>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} FFB Finance. All rights reserved.</p>
        <p>This email was sent to you because you have an account with FFB Finance.</p>
        <p>For any questions, please contact our support team at support@ffbfinance.com</p>
      </div>
    </div>
  </body>
  </html>`;

  // Select template based on name
  switch (templateName) {
    case 'transaction':
      return baseTemplate(`
        <p>Hello {{userName}},</p>
        <p>{{message}}</p>
        <div class="info-box">
          <h3>Transaction Details</h3>
          <table>
            <tr><th>Type</th><td>{{transactionType}}</td></tr>
            <tr><th>Amount</th><td>{{amount}} {{currency}}</td></tr>
            <tr><th>Status</th><td>{{status}}</td></tr>
            <tr><th>Date</th><td>{{date}}</td></tr>
            {{#if reference}}<tr><th>Reference</th><td>{{reference}}</td></tr>{{/if}}
          </table>
        </div>
        {{#if actionLink}}
        <div style="text-align: center;">
          <a href="{{actionLink}}" class="button">View Transaction Details</a>
        </div>
        {{/if}}
        <p>If you didn't initiate this transaction, please contact our support immediately.</p>
      `);

    case 'price_alert':
      return baseTemplate(`
        <p>Hello {{userName}},</p>
        <p>{{message}}</p>
        <div class="info-box">
          <h3>Alert Details</h3>
          <table>
            <tr><th>Symbol</th><td>{{symbol}}</td></tr>
            <tr><th>Condition</th><td>{{condition}}</td></tr>
            <tr><th>Target Price</th><td>{{targetPrice}}</td></tr>
            <tr><th>Current Price</th><td>{{currentPrice}}</td></tr>
            <tr><th>Triggered At</th><td>{{triggeredAt}}</td></tr>
          </table>
        </div>
        {{#if actionLink}}
        <div style="text-align: center;">
          <a href="{{actionLink}}" class="button">View Market Details</a>
        </div>
        {{/if}}
      `);

    case 'order':
      return baseTemplate(`
        <p>Hello {{userName}},</p>
        <p>{{message}}</p>
        <div class="info-box">
          <h3>Order Details</h3>
          <table>
            <tr><th>Symbol</th><td>{{symbol}}</td></tr>
            <tr><th>Type</th><td>{{orderType}}</td></tr>
            <tr><th>Side</th><td>{{side}}</td></tr>
            <tr><th>Quantity</th><td>{{quantity}}</td></tr>
            <tr><th>Price</th><td>{{price}}</td></tr>
            <tr><th>Status</th><td>{{status}}</td></tr>
            <tr><th>Date</th><td>{{date}}</td></tr>
          </table>
        </div>
        {{#if actionLink}}
        <div style="text-align: center;">
          <a href="{{actionLink}}" class="button">View Order Details</a>
        </div>
        {{/if}}
      `);

    case 'card':
      return baseTemplate(`
        <p>Hello {{userName}},</p>
        <p>{{message}}</p>
        <div class="info-box">
          <h3>Card Details</h3>
          <table>
            <tr><th>Card Type</th><td>{{cardType}}</td></tr>
            <tr><th>Status</th><td>{{status}}</td></tr>
            {{#if lastFourDigits}}<tr><th>Last Four Digits</th><td>{{lastFourDigits}}</td></tr>{{/if}}
            {{#if expiryDate}}<tr><th>Expiry Date</th><td>{{expiryDate}}</td></tr>{{/if}}
          </table>
        </div>
        {{#if actionLink}}
        <div style="text-align: center;">
          <a href="{{actionLink}}" class="button">Manage Your Card</a>
        </div>
        {{/if}}
        <p>If you did not request this card, please contact our support immediately.</p>
      `);

    case 'kyc':
      return baseTemplate(`
        <p>Hello {{userName}},</p>
        <p>{{message}}</p>
        <div class="{{#if approved}}success-box{{else}}info-box{{/if}}">
          <h3>KYC Verification Status</h3>
          <table>
            <tr><th>Status</th><td>{{status}}</td></tr>
            <tr><th>Date</th><td>{{date}}</td></tr>
            {{#if reason}}<tr><th>Reason</th><td>{{reason}}</td></tr>{{/if}}
          </table>
        </div>
        {{#if actionLink}}
        <div style="text-align: center;">
          <a href="{{actionLink}}" class="button">Go to Your Profile</a>
        </div>
        {{/if}}
      `);

    case 'security':
      return baseTemplate(`
        <p>Hello {{userName}},</p>
        <p>{{message}}</p>
        <div class="alert-box">
          <h3>Security Alert</h3>
          <table>
            <tr><th>Activity</th><td>{{activity}}</td></tr>
            <tr><th>Time</th><td>{{time}}</td></tr>
            {{#if location}}<tr><th>Location</th><td>{{location}}</td></tr>{{/if}}
            {{#if deviceInfo}}<tr><th>Device</th><td>{{deviceInfo}}</td></tr>{{/if}}
          </table>
        </div>
        {{#if actionLink}}
        <div style="text-align: center;">
          <a href="{{actionLink}}" class="button">Secure Your Account</a>
        </div>
        {{/if}}
        <p>If you didn't perform this action, please secure your account immediately by changing your password and contacting our support team.</p>
      `);

    case 'support':
      return baseTemplate(`
        <p>Hello {{userName}},</p>
        <p>{{message}}</p>
        <div class="info-box">
          <h3>Support Ticket</h3>
          <table>
            <tr><th>Ticket Number</th><td>{{ticketNumber}}</td></tr>
            <tr><th>Subject</th><td>{{subject}}</td></tr>
            <tr><th>Status</th><td>{{status}}</td></tr>
            <tr><th>Created</th><td>{{date}}</td></tr>
          </table>
        </div>
        {{#if reply}}
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4>Latest Reply:</h4>
          <p>{{reply}}</p>
        </div>
        {{/if}}
        {{#if actionLink}}
        <div style="text-align: center;">
          <a href="{{actionLink}}" class="button">View Ticket</a>
        </div>
        {{/if}}
      `);

    // Default notification template
    default:
      return baseTemplate(`
        <p>Hello {{userName}},</p>
        <p>{{message}}</p>
        {{#if additionalInfo}}
        <div class="info-box">
          {{additionalInfo}}
        </div>
        {{/if}}
        {{#if actionLink}}
        <div style="text-align: center;">
          <a href="{{actionLink}}" class="button">{{actionText}}</a>
        </div>
        {{/if}}
      `);
  }
};

// Function to send notification emails with specialized templates
export const sendNotificationEmail = async (user, notification) => {
  try {
    if (!user || !user.email) {
      throw new Error('User or user email not provided');
    }
    
    // Select template based on notification type
    let templateName = 'notification';
    let context = {
      title: notification.title,
      message: notification.message,
      type: notification.type,
      actionLink: notification.link,
      actionText: 'View Details',
      userName: user.fullName || user.firstName || user.email,
    };
    
    // Add specific context based on notification type
    if (notification.type === 'transaction' || notification.type === 'deposit' || notification.type === 'withdrawal') {
      templateName = 'transaction';
      if (notification.data) {
        context = {
          ...context,
          transactionType: notification.data.type || notification.type,
          amount: notification.data.amount,
          currency: notification.data.currency || 'USD',
          status: notification.data.status,
          date: notification.data.date || new Date().toLocaleString(),
          reference: notification.data.reference
        };
      }
    } else if (notification.type === 'price_alert') {
      templateName = 'price_alert';
      if (notification.data) {
        context = {
          ...context,
          symbol: notification.data.symbol,
          condition: notification.data.condition,
          targetPrice: notification.data.targetPrice,
          currentPrice: notification.data.currentPrice,
          triggeredAt: notification.data.triggeredAt || new Date().toLocaleString()
        };
      }
    } else if (notification.type === 'order') {
      templateName = 'order';
      if (notification.data) {
        context = {
          ...context,
          symbol: notification.data.symbol,
          orderType: notification.data.type,
          side: notification.data.side,
          quantity: notification.data.quantity,
          price: notification.data.price,
          status: notification.data.status,
          date: notification.data.date || new Date().toLocaleString()
        };
      }
    } else if (notification.type === 'card') {
      templateName = 'card';
      if (notification.data) {
        context = {
          ...context,
          cardType: notification.data.cardType,
          status: notification.data.status,
          lastFourDigits: notification.data.lastFourDigits,
          expiryDate: notification.data.expiryDate
        };
      }
    } else if (notification.type === 'kyc') {
      templateName = 'kyc';
      if (notification.data) {
        context = {
          ...context,
          status: notification.data.status,
          date: notification.data.date || new Date().toLocaleString(),
          reason: notification.data.reason,
          approved: notification.data.status === 'approved'
        };
      }
    } else if (notification.type === 'security') {
      templateName = 'security';
      if (notification.data) {
        context = {
          ...context,
          activity: notification.data.activity,
          time: notification.data.time || new Date().toLocaleString(),
          location: notification.data.location,
          deviceInfo: notification.data.deviceInfo
        };
      }
    } else if (notification.type === 'support') {
      templateName = 'support';
      if (notification.data) {
        context = {
          ...context,
          ticketNumber: notification.data.ticketNumber,
          subject: notification.data.subject,
          status: notification.data.status,
          date: notification.data.date || new Date().toLocaleString(),
          reply: notification.data.reply
        };
      }
    }
    
    return await sendEmail({
      to: user.email,
      subject: notification.title,
      templateName,
      context,
    });
  } catch (error) {
    logger.error(`Error sending notification email to ${user?.email}:`, error);
    // Don't throw error to prevent notification creation failure
    return null;
  }
};

export default {
  sendEmail,
  sendNotificationEmail,
};