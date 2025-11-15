// src/auth/auth.schemas.ts
import { z } from "zod";

// --------- LOGIN ---------
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(3),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// --------- REGISTER ---------
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(3),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

// --------- OAUTH TOKEN (ALEXA) ---------
export const TokenRequestSchema = z.object({
  grant_type: z.enum(["authorization_code", "refresh_token"]),
  code: z.string().optional(),
  refresh_token: z.string().optional(),
  client_id: z.string(),
  client_secret: z.string(),
  redirect_uri: z.string().optional(),
});

export type TokenRequestInput = z.infer<typeof TokenRequestSchema>;

// --------- ESQUECI A SENHA ---------
export const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestSchema>;

// --------- REDEFINIR SENHA ---------
export const PasswordResetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(3),
});

export type PasswordResetInput = z.infer<typeof PasswordResetSchema>;
