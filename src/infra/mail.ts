import { createTransport } from "nodemailer";

export type Mail = { to: string; subject: string; text: string };
export type Deliver = (mail: Mail) => Promise<void>;

/**
 * Delivery adapter (C2-T4). SMTP settings come from the environment; in
 * development `npm run mailbox` (scripts/mailbox.mjs) receives on port 1025.
 */
export const smtpDeliver: Deliver = async (mail) => {
  await createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } } : {}),
  }).sendMail({ from: process.env.SMTP_FROM, ...mail });
};
