// src/utils/mailer.ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

export async function sendPasswordResetEmail(to: string, token: string) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  // Ideal: esse link apontar para o front (web/app) que consome o /auth/reset-password
  const resetLink = `${appUrl}/reset-password?token=${token}`;

  const mailOptions = {
    from: `"Smart Home" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Redefinição de senha - Smart Home",
    html: `
      <p>Olá,</p>
      <p>Recebemos um pedido para redefinir a sua senha.</p>
      <p>Clique no link abaixo para criar uma nova senha:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>Se você não solicitou isso, pode ignorar este e-mail.</p>
    `,
  };


  
  await transporter.sendMail(mailOptions);
}

export async function sendEmailVerificationEmail(to: string, token: string) {
  const confirmLink = `${process.env.APP_URL}/auth/confirm-email?token=${token}`;

  const mailOptions = {
    from: `"Smart Home" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Confirme seu e-mail - Smart Home",
    html: `
      <p>Olá,</p>
      <p>Obrigado por se cadastrar no Smart Home.</p>
      <p>Clique no link abaixo para confirmar o seu e-mail:</p>
      <p><a href="${confirmLink}">${confirmLink}</a></p>
      <p>Se você não criou esta conta, pode ignorar este e-mail.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
}