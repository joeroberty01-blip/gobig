import "server-only";
import nodemailer from "nodemailer";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { ResetRequest } from "@/lib/services/auth";

// Delivery for account messages. Email first, SMS (SMSGate, same as the ERP) when the account
// has no email and the gateway is configured. With neither configured, development prints the
// link to the server console so the flow can be tested; production logs an error and sends
// nothing — it never exposes the link to the browser.

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function smsConfigured(): boolean {
  return Boolean(process.env.SMS_GATEWAY_USER && process.env.SMS_GATEWAY_PASS);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
}

async function sendSms(phone: string, text: string): Promise<void> {
  const base = (process.env.SMS_GATEWAY_URL || "https://api.sms-gate.app/3rdparty/v1").replace(/\/+$/, "");
  const auth = Buffer.from(`${process.env.SMS_GATEWAY_USER}:${process.env.SMS_GATEWAY_PASS}`).toString("base64");
  const res = await fetch(`${base}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ textMessage: { text }, phoneNumbers: [`+${phone}`] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`SMS gateway responded ${res.status}`);
}

export function appUrl(path: string): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

/** Sends the reset link. Failures are logged, never shown, so the response stays generic. */
export async function deliverPasswordReset({ user, token }: ResetRequest): Promise<void> {
  // SEC-008: in the fragment, so the token is never sent to the server or written to access logs.
  const link = appUrl(`/reset-password#token=${encodeURIComponent(token)}`);
  const t = getDictionary(user.locale).resetMessage;
  const body = t.body.replace("{name}", user.name).replace("{link}", link);

  try {
    if (user.email && smtpConfigured()) {
      await sendEmail(user.email, t.subject, body);
      return;
    }
    if (user.phone && smsConfigured()) {
      await sendSms(user.phone, t.sms.replace("{link}", link));
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      console.info(`[dev] Password reset link for user ${user.id}: ${link}`);
      return;
    }
    console.error(`Password reset requested for user ${user.id} but no email/SMS channel is configured.`);
  } catch (err) {
    console.error(`Password reset delivery failed for user ${user.id}:`, err);
  }
}
