import Mailjet from "node-mailjet";
import SystemSetting from "../models/SystemSetting.js";
import User from "../models/User.js";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";
import { DEFAULT_EMAIL_TEMPLATES, renderHandlebars } from "./emailTemplates.js";

const TEMPLATE_KEY_PREFIX = "email.template.";

function getMailjetClient() {
	const apiKey = process.env.MAILJET_API_KEY;
	const apiSecret = process.env.MAILJET_SECRET_KEY;

	if (!apiKey || !apiSecret) {
		throw new ApiError(
			"Mailjet is not configured (missing MAILJET_API_KEY/MAILJET_SECRET_KEY)",
			500,
			"email_not_configured",
		);
	}

	return new Mailjet({ apiKey, apiSecret });
}

function normalizeToList(to) {
	if (!to) return [];

	if (Array.isArray(to)) {
		return to
			.filter(Boolean)
			.map((t) => (typeof t === "string" ? { email: t } : t))
			.filter((t) => t.email);
	}

	if (typeof to === "string") return [{ email: to }];
	if (typeof to === "object" && to.email) return [to];
	return [];
}

export async function getAdminRecipientEmails() {
	const admins = await User.find({ role: { $in: ["admin", "superadmin"] } })
		.select("email status")
		.lean();

	return admins
		.filter((a) => a?.email && a.status !== "inactive")
		.map((a) => a.email);
}

export async function getEmailTemplate(templateKey) {
	if (!templateKey) {
		throw new ApiError("Template key is required", 400, "validation_error");
	}

	const defaultTemplate = DEFAULT_EMAIL_TEMPLATES[templateKey];

	const dbKey = `${TEMPLATE_KEY_PREFIX}${templateKey}`;
	const setting = await SystemSetting.findOne({ key: dbKey }).lean();

	const fromDb = setting?.value && typeof setting.value === "object" ? setting.value : null;

	const resolved = {
		templateKey,
		description: (fromDb && fromDb.description) || defaultTemplate?.description || "",
		subject: (fromDb && fromDb.subject) || defaultTemplate?.subject,
		html: (fromDb && fromDb.html) || defaultTemplate?.html,
		text: (fromDb && fromDb.text) || defaultTemplate?.text,
		isOverridden: !!fromDb,
		updatedAt: setting?.updatedAt,
	};

	if (!resolved.subject || (!resolved.html && !resolved.text)) {
		throw new ApiError(
			`Unknown or invalid email template '${templateKey}'`,
			404,
			"template_not_found",
		);
	}

	return resolved;
}

export async function upsertEmailTemplate({ templateKey, subject, html, text, description, updatedBy }) {
	if (!templateKey) {
		throw new ApiError("Template key is required", 400, "validation_error");
	}

	if (!subject || typeof subject !== "string") {
		throw new ApiError("Template subject is required", 400, "validation_error");
	}

	if ((!html || typeof html !== "string") && (!text || typeof text !== "string")) {
		throw new ApiError(
			"Template must include html or text content",
			400,
			"validation_error",
		);
	}

	const key = `${TEMPLATE_KEY_PREFIX}${templateKey}`;

	const payload = {
		subject,
		html: html || "",
		text: text || "",
		description: description || DEFAULT_EMAIL_TEMPLATES[templateKey]?.description || "",
	};

	const doc = await SystemSetting.findOneAndUpdate(
		{ key },
		{
			$set: {
				key,
				value: payload,
				description: payload.description || `Email template: ${templateKey}`,
				category: "email",
				type: "json",
				options: [],
				sensitive: false,
				updatedBy: updatedBy || null,
			},
			$setOnInsert: {
				createdBy: updatedBy || null,
			},
		},
		{ new: true, upsert: true },
	);

	return doc;
}

export async function sendEmail({
	to,
	subject,
	html,
	text,
	customId,
	fromEmail,
	fromName,
}) {
	const toList = normalizeToList(to);
	if (!toList.length) {
		throw new ApiError("Recipient email is required", 400, "validation_error");
	}

	if (!subject) {
		throw new ApiError("Email subject is required", 400, "validation_error");
	}

	if (!html && !text) {
		throw new ApiError("Email html or text is required", 400, "validation_error");
	}

	const mj = getMailjetClient();

	const senderEmail = fromEmail || process.env.MAILJET_SENDER_EMAIL || "support@ffbroker.cam";
	const senderName = fromName || process.env.MAILJET_SENDER_NAME || "FFB";

	const message = {
		Messages: [
			{
				From: {
					Email: senderEmail,
					Name: senderName,
				},
				To: toList.map((t) => ({ Email: t.email, Name: t.name || "" })),
				Subject: subject,
				...(text ? { TextPart: text } : {}),
				...(html ? { HTMLPart: html } : {}),
				...(customId ? { CustomID: customId } : {}),
			},
		],
	};

	try {
		const result = await mj.post("send", { version: "v3.1" }).request(message);
		return { ok: true, result: result.body };
	} catch (err) {
		logger.error("Mailjet send error", {
			message: err?.message,
			response: err?.response?.body,
		});
		return { ok: false, error: err };
	}
}

export async function sendTemplateEmail({ templateKey, to, variables, customId }) {
	const template = await getEmailTemplate(templateKey);

	const v = {
		name: "Customer",
		...variables,
	};

	const subject = renderHandlebars(template.subject, v);
	const html = template.html ? renderHandlebars(template.html, v) : "";
	const text = template.text ? renderHandlebars(template.text, v) : "";

	return sendEmail({
		to,
		subject,
		html,
		text,
		customId: customId || `template:${templateKey}`,
	});
}

export async function listEmailTemplates() {
	const defaults = Object.keys(DEFAULT_EMAIL_TEMPLATES);
	const prefixRegex = `^${TEMPLATE_KEY_PREFIX.replaceAll(".", "\\.")}`;
	const settings = await SystemSetting.find({ key: { $regex: prefixRegex } })
		.select("key value updatedAt")
		.lean();

	const fromDbKeys = settings.map((s) => s.key.replace(TEMPLATE_KEY_PREFIX, ""));
	const allKeys = Array.from(new Set([...defaults, ...fromDbKeys])).sort();

	const out = [];
	for (const k of allKeys) {
		const resolved = await getEmailTemplate(k);
		out.push(resolved);
	}
	return out;
}

export const __testables = {
	normalizeToList,
	getMailjetClient,
	TEMPLATE_KEY_PREFIX,
	renderHandlebars,
};
