import "server-only";

import nodemailer from "nodemailer";

type MailAttachment = {
  content: Buffer;
  contentType: string;
  filename: string;
};

type SendMailParams = {
  from?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
};

function getSmtpConfig(fromOverride?: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = fromOverride || process.env.SMTP_FROM;

  if (!host || !user || !pass || !from) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and a sender address.");
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    from,
  };
}

export function isSmtpConfigured(fromOverride?: string) {
  return Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
    && (fromOverride || process.env.SMTP_FROM),
  );
}

export async function sendMail({
  from,
  to,
  subject,
  html,
  text,
  attachments = [],
}: SendMailParams) {
  const config = getSmtpConfig(from);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: config.auth,
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    html,
    text,
    attachments,
  });
}
