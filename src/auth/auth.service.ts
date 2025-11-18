// src/auth/auth.service.ts
import crypto from "crypto";
import { prisma } from "../prisma";
import {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
} from "../utils/mailer";

export class AuthService {
  private clientId = process.env.OAUTH_CLIENT_ID || "alexa-client";
  private clientSecret = process.env.OAUTH_CLIENT_SECRET || "alexa-secret";

  // ---------------- CLIENTE (ALEXA / OAUTH) ----------------

  validateClient(clientId: string, clientSecret?: string) {
    if (clientId !== this.clientId) return false;
    if (clientSecret !== undefined && clientSecret !== this.clientSecret) return false;
    return true;
  }

  // ---------------- USUÁRIO ----------------

  async validateUser(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    // TODO: trocar por bcrypt.compare
    if (user.password !== password) return null;

    // Bloquear login se e-mail não foi confirmado
    if (!user.emailVerified) {
      const err: any = new Error("Email not verified");
      err.type = "email_not_verified";
      throw err;
    }

    return user;
  }

  async register(email: string, password: string) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error("User already exists");
    }

    // TODO: trocar por bcrypt.hash
    const user = await prisma.user.create({
      data: {
        email,
        password,
      },
    });

    // Cria token de verificação e envia e-mail
    await this.createEmailVerification(user.id, user.email);

    return user;
  }

  // Cria token de verificação de e-mail + envia e-mail
  private async createEmailVerification(userId: string, email: string) {
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24h para confirmar

    await prisma.emailVerificationToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    await sendEmailVerificationEmail(email, token);
  }

  // Confirma um token enviado por e-mail
  async confirmEmail(token: string) {
    const verifyToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!verifyToken || verifyToken.used) {
      const err: any = new Error("Invalid token");
      err.type = "invalid_grant";
      throw err;
    }

    if (verifyToken.expiresAt < new Date()) {
      const err: any = new Error("Token expired");
      err.type = "invalid_grant";
      throw err;
    }

    await prisma.user.update({
      where: { id: verifyToken.userId },
      data: { emailVerified: true },
    });

    await prisma.emailVerificationToken.update({
      where: { id: verifyToken.id },
      data: { used: true },
    });

    return true;
  }

  // ---------------- AUTH CODE (OAUTH) ----------------

  async generateAuthCode(userId: string) {
    const code = crypto.randomUUID();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 min

    await prisma.authCode.create({
      data: {
        userId,
        code,
        expiresAt,
      },
    });

    return code;
  }

  async exchangeAuthCodeForTokens(code: string, clientId: string, clientSecret: string) {
    if (!this.validateClient(clientId, clientSecret)) {
      const err: any = new Error("invalid_client");
      err.type = "invalid_client";
      throw err;
    }

    const authCode = await prisma.authCode.findUnique({
      where: { code },
    });

    if (!authCode) {
      const err: any = new Error("invalid_grant");
      err.type = "invalid_grant";
      throw err;
    }

    if (authCode.expiresAt < new Date()) {
      await prisma.authCode.delete({ where: { id: authCode.id } }).catch(() => {});
      const err: any = new Error("authorization_code_expired");
      err.type = "invalid_grant";
      throw err;
    }

    const token = await this.generateTokens(authCode.userId);

    await prisma.authCode.delete({ where: { id: authCode.id } }).catch(() => {});

    return token;
  }

  // ---------------- TOKENS (ACCESS / REFRESH) ----------------

  async generateTokens(userId: string) {
    const accessToken = crypto.randomUUID();
    const refreshToken = crypto.randomUUID();

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1h

    const token = await prisma.token.create({
      data: {
        userId,
        accessToken,
        refreshToken,
        expiresAt,
      },
    });

    return token;
  }

  async refreshTokens(refreshToken: string, clientId: string, clientSecret: string) {
    if (!this.validateClient(clientId, clientSecret)) {
      const err: any = new Error("invalid_client");
      err.type = "invalid_client";
      throw err;
    }

    const token = await prisma.token.findUnique({
      where: { refreshToken },
    });

    if (!token) {
      const err: any = new Error("invalid_grant");
      err.type = "invalid_grant";
      throw err;
    }

    if (token.expiresAt < new Date()) {
      const err: any = new Error("refresh_token_expired");
      err.type = "invalid_grant";
      throw err;
    }

    const newAccessToken = crypto.randomUUID();
    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + 1);

    const updated = await prisma.token.update({
      where: { id: token.id },
      data: {
        accessToken: newAccessToken,
        expiresAt: newExpiresAt,
      },
    });

    return updated;
  }

  // ---------------- RESET DE SENHA POR E-MAIL ----------------

  async requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });

    // Não revela se o usuário existe ou não
    if (!user) return;

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1h

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    await sendPasswordResetEmail(email, token);
  }

  async resetPassword(token: string, newPassword: string) {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.used) {
      const err: any = new Error("Invalid token");
      err.type = "invalid_grant";
      throw err;
    }

    if (resetToken.expiresAt < new Date()) {
      const err: any = new Error("Token expired");
      err.type = "invalid_grant";
      throw err;
    }

    // TODO: trocar por bcrypt.hash
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: newPassword },
    });

    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });
  }


   async validateAccessToken(accessToken: string) {
    if (!accessToken) {
      throw new Error("missing_token");
    }

    const tokenRecord = await prisma.token.findUnique({
      where: { accessToken },
      include: { user: true },
    });

    if (!tokenRecord || !tokenRecord.user) {
      const err: any = new Error("invalid_token");
      err.code = "invalid_token";
      throw err;
    }

    if (tokenRecord.expiresAt < new Date()) {
      const err: any = new Error("token_expired");
      err.code = "token_expired";
      throw err;
    }

    return tokenRecord.user;
  }
}
