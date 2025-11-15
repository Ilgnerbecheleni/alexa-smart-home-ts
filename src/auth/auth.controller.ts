// src/auth/auth.controller.ts
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import {
  LoginSchema,
  RegisterSchema,
  TokenRequestSchema,
  PasswordResetRequestSchema,
  PasswordResetSchema,
} from "./auth.schemas";
import { zodError } from "../utils/zodError";

const authService = new AuthService();

export class AuthController {
  // ------------ /oauth/authorize (Alexa) ------------
  async authorize(req: Request, res: Response) {
    try {
      const { response_type, client_id, redirect_uri, state, user_id } = req.query as {
        response_type?: string;
        client_id?: string;
        redirect_uri?: string;
        state?: string;
        user_id?: string;
      };

      if (
        !response_type ||
        response_type !== "code" ||
        !client_id ||
        !redirect_uri ||
        !state ||
        !user_id
      ) {
        return res.status(400).send("Invalid authorize request");
      }

      if (!authService.validateClient(client_id)) {
        return res.status(400).send("Invalid client");
      }

      const code = await authService.generateAuthCode(user_id);

      const url = new URL(redirect_uri);
      url.searchParams.set("code", code);
      url.searchParams.set("state", state);

      return res.redirect(url.toString());
    } catch (err) {
      console.error(err);
      return res.status(500).send("Internal server error");
    }
  }

  // ------------ /oauth/token (Alexa + geral) ------------
  async token(req: Request, res: Response) {
    try {
      const parsed = TokenRequestSchema.parse(req.body);

      if (parsed.grant_type === "authorization_code") {
        if (!parsed.code) {
          return res.status(400).json({
            error: "invalid_request",
            error_description: "Missing authorization code",
          });
        }

        try {
          const token = await authService.exchangeAuthCodeForTokens(
            parsed.code,
            parsed.client_id,
            parsed.client_secret,
          );

          return res.json({
            access_token: token.accessToken,
            refresh_token: token.refreshToken,
            token_type: "Bearer",
            expires_in: 3600,
          });
        } catch (e: any) {
          const type = e?.type || "invalid_grant";
          return res.status(400).json({
            error: type,
            error_description: e?.message ?? "Could not exchange authorization code",
          });
        }
      }

      if (parsed.grant_type === "refresh_token") {
        if (!parsed.refresh_token) {
          return res.status(400).json({
            error: "invalid_request",
            error_description: "Missing refresh_token",
          });
        }

        try {
          const token = await authService.refreshTokens(
            parsed.refresh_token,
            parsed.client_id,
            parsed.client_secret,
          );

          return res.json({
            access_token: token.accessToken,
            refresh_token: token.refreshToken,
            token_type: "Bearer",
            expires_in: 3600,
          });
        } catch (e: any) {
          const type = e?.type || "invalid_grant";
          return res.status(400).json({
            error: type,
            error_description: e?.message ?? "Could not refresh token",
          });
        }
      }

      return res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "Unsupported grant_type",
      });
    } catch (err) {
      return res.status(400).json(zodError(err));
    }
  }

  // ------------ /auth/register ------------
  async register(req: Request, res: Response) {
    try {
      const parsed = RegisterSchema.parse(req.body);
      const user = await authService.register(parsed.email, parsed.password);
      return res.status(201).json({
        id: user.id,
        email: user.email,
        message: "Usuário criado. Verifique seu e-mail para confirmar o cadastro.",
      });
    } catch (err: any) {
      if (err?.message === "User already exists") {
        return res.status(409).json({
          error: "user_exists",
          error_description: "User already exists",
        });
      }
      return res.status(400).json(zodError(err));
    }
  }

  // ------------ /auth/login ------------
  async login(req: Request, res: Response) {
    try {
      const parsed = LoginSchema.parse(req.body);
      try {
        const user = await authService.validateUser(parsed.email, parsed.password);
        if (!user) {
          return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = await authService.generateTokens(user.id);
        return res.json({
          access_token: token.accessToken,
          refresh_token: token.refreshToken,
          token_type: "Bearer",
          expires_in: 3600,
        });
      } catch (e: any) {
        if (e?.type === "email_not_verified") {
          return res.status(403).json({
            error: "email_not_verified",
            error_description: "É necessário confirmar o e-mail antes de fazer login.",
          });
        }
        throw e;
      }
    } catch (err) {
      return res.status(400).json(zodError(err));
    }
  }

  // ------------ /auth/confirm-email ------------
  async confirmEmail(req: Request, res: Response) {
    try {
      const token = (req.query.token as string) || (req.body.token as string);

      if (!token) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing token",
        });
      }

      await authService.confirmEmail(token);

      // Aqui você pode redirecionar para uma página do front, se quiser
      return res.json({ message: "E-mail confirmado com sucesso. Já pode fazer login." });
    } catch (err: any) {
      return res.status(400).json({
        error: "invalid_token",
        error_description: err?.message ?? "Could not confirm email",
      });
    }
  }

  // ------------ /auth/forgot-password ------------
  async requestPasswordReset(req: Request, res: Response) {
    try {
      const parsed = PasswordResetRequestSchema.parse(req.body);
      await authService.requestPasswordReset(parsed.email);

      return res.json({
        message: "Se o e-mail existir, você receberá as instruções para redefinir a senha.",
      });
    } catch (err) {
      return res.status(400).json(zodError(err));
    }
  }

  // ------------ /auth/reset-password ------------
  async resetPassword(req: Request, res: Response) {
    try {
      const parsed = PasswordResetSchema.parse(req.body);
      await authService.resetPassword(parsed.token, parsed.password);

      return res.json({ message: "Senha redefinida com sucesso." });
    } catch (err: any) {
      return res.status(400).json({
        error: "reset_failed",
        error_description: err?.message ?? "Could not reset password",
      });
    }
  }
}
