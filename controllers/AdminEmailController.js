import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";
import User from "../models/User.js";
import {
  getAdminRecipientEmails,
  getEmailTemplate,
  listEmailTemplates,
  sendTemplateEmail,
  upsertEmailTemplate,
} from "../services/emailService.js";

export const adminListEmailTemplates = async (req, res, next) => {
  try {
    const templates = await listEmailTemplates();
    res.status(200).json({ success: true, data: templates });
  } catch (err) {
    next(err);
  }
};

export const adminGetEmailTemplate = async (req, res, next) => {
  try {
    const { templateKey } = req.params;
    const template = await getEmailTemplate(templateKey);
    res.status(200).json({ success: true, data: template });
  } catch (err) {
    next(err);
  }
};

export const adminUpsertEmailTemplate = async (req, res, next) => {
  try {
    const { templateKey } = req.params;
    const { subject, html, text, description } = req.body || {};

    const saved = await upsertEmailTemplate({
      templateKey,
      subject,
      html,
      text,
      description,
      updatedBy: req.user?._id,
    });

    res.status(200).json({
      success: true,
      message: "Template saved",
      data: {
        key: saved.key,
        updatedAt: saved.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const adminSendEmail = async (req, res, next) => {
  try {
    const {
      templateKey,
      toEmail,
      toUserId,
      toAdmins,
      variables,
    } = req.body || {};

    if (!templateKey) {
      throw new ApiError("templateKey is required", 400, "validation_error");
    }

    let recipients = [];

    if (toAdmins) {
      const adminEmails = await getAdminRecipientEmails();
      recipients.push(...adminEmails.map((e) => ({ email: e })));
    }

    if (toEmail) {
      recipients.push({ email: toEmail });
    }

    if (toUserId) {
      const user = await User.findById(toUserId).select("email firstName lastName");
      if (!user) {
        throw new ApiError("User not found", 404, "not_found");
      }
      recipients.push({
        email: user.email,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      });
    }

    // de-dupe by email
    const seen = new Set();
    recipients = recipients.filter((r) => {
      const e = (r?.email || "").toLowerCase().trim();
      if (!e || seen.has(e)) return false;
      seen.add(e);
      return true;
    });

    if (!recipients.length) {
      throw new ApiError(
        "Provide at least one recipient (toEmail, toUserId, or toAdmins)",
        400,
        "validation_error",
      );
    }

    const result = await sendTemplateEmail({
      templateKey,
      to: recipients,
      variables: variables || {},
      customId: `admin-send:${templateKey}`,
    });

    res.status(200).json({
      success: true,
      data: {
        recipients: recipients.map((r) => r.email),
        mailjet: result,
      },
    });
  } catch (err) {
    logger.error("Admin send email error", { message: err?.message });
    next(err);
  }
};

export default {
  adminListEmailTemplates,
  adminGetEmailTemplate,
  adminUpsertEmailTemplate,
  adminSendEmail,
};
