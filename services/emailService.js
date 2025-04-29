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
    
    // Check if template exists, if not create a default one
    if (!fs.existsSync(templatePath)) {
      const defaultTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>{{subject}}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0066cc; color: white; padding: 10px 20px; border-radius: 5px 5px 0 0; }
          .content { padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>{{title}}</h2>
          </div>
          <div class="content">
            {{{message}}}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FFB Finance. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>`;
      fs.writeFileSync(templatePath, defaultTemplate);
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

// Function to send notification emails
export const sendNotificationEmail = async (user, notification) => {
  try {
    if (!user || !user.email) {
      throw new Error('User or user email not provided');
    }
    
    return await sendEmail({
      to: user.email,
      subject: notification.title,
      templateName: 'notification',
      context: {
        title: notification.title,
        message: notification.message,
        type: notification.type,
        actionLink: notification.link,
        userName: user.fullName || user.email,
      },
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