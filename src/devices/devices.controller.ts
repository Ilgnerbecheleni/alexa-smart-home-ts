// src/devices/devices.controller.ts
import { Request, Response } from "express";
import { prisma } from "../prisma";
import { DeviceType, DeviceIntegration } from "@prisma/client";
import { CreateDeviceSchema } from "./devices.schemas";
import { publishToDeviceCommand } from "../mqtt/mqttClient";
// se você já usa esse helper de erros de Zod em outros lugares:
import { zodError } from "../utils/zodError";
import { DevicesService } from "./devices.service";

export class DevicesController {
  
  private devicesService = new DevicesService();
  // ----------------- HELPER: pega usuário pelo access_token -----------------
  private async getUserFromRequest(req: Request, res: Response) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "missing_token",
        error_description: "Authorization header with Bearer token is required",
      });
      return null;
    }

    const accessToken = authHeader.substring("Bearer ".length).trim();

    if (!accessToken) {
      res.status(401).json({
        error: "invalid_token",
        error_description: "Empty access token",
      });
      return null;
    }

    const tokenRecord = await prisma.token.findUnique({
      where: { accessToken },
      include: { user: true },
    });

    if (!tokenRecord || !tokenRecord.user) {
      res.status(401).json({
        error: "invalid_token",
        error_description: "Token not found or user not associated",
      });
      return null;
    }

    if (tokenRecord.expiresAt < new Date()) {
      res.status(401).json({
        error: "token_expired",
        error_description: "Access token expired",
      });
      return null;
    }

    return tokenRecord.user;
  }

  // ----------------- GET /devices -----------------
  // Lista todos os devices do usuário autenticado
  async list(req: Request, res: Response) {
    try {
      const user = await this.getUserFromRequest(req, res);
      if (!user) return;

      const devices = await prisma.device.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      });

      return res.json(devices);
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        error: "internal_error",
        error_description: "Could not list devices",
      });
    }
  }

  // ----------------- POST /devices -----------------
  // Cria um device:
  // - integration = BOARD        -> topic gerado automaticamente
  // - integration = CUSTOM_TOPIC -> usa topic enviado no body
  async create(req: Request, res: Response) {
    try {
      const user = await this.getUserFromRequest(req, res);
      if (!user) return;

      const parsed = CreateDeviceSchema.parse(req.body);

      const {
        name,
        endpointId,
        description,
        type,
        integration,
        topic,
        channels,
      } = parsed;

      // Zod já garantiu: name, endpointId, type, integration, channels válidos
      // Precisamos apenas mapear string -> enum do Prisma
      const prismaType = type as DeviceType;
      const prismaIntegration = integration as DeviceIntegration;

      let finalTopic: string;

      if (prismaIntegration === DeviceIntegration.BOARD) {
        finalTopic = `users/${user.id}/devices/${endpointId}`;
      } else {
        finalTopic = topic!.trim();
      }

      try {
        const device = await prisma.device.create({
          data: {
            name,
            endpointId,
            topic: finalTopic,
            description: description ?? null,
            userId: user.id,
            type: prismaType,
            integration: prismaIntegration,
            channels,
          },
        });

        return res.status(201).json(device);
      } catch (e: any) {
        console.error(e);

        // P2002 = unique constraint (endpointId ou topic duplicado)
        if (e?.code === "P2002") {
          return res.status(409).json({
            error: "device_exists",
            error_description:
              "Já existe um device com esse endpointId ou topic",
          });
        }

        return res.status(500).json({
          error: "internal_error",
          error_description: "Could not create device",
        });
      }
    } catch (err: any) {
      // Erro de validação Zod
      if (err.name === "ZodError") {
        // Se você já tem zodError helper:
        return res.status(400).json(zodError(err));
        // Se não tiver, pode usar:
        // return res.status(400).json({ error: "validation_error", issues: err.errors });
      }

      console.error(err);
      return res.status(500).json({
        error: "internal_error",
        error_description: "Could not create device",
      });
    }
  }

  // ----------------- PATCH /devices/:id/power -----------------
  // Atualiza o estado de power de um device pertencente ao usuário
  // e envia comando MQTT para <device.topic>/command
  async updatePower(req: Request, res: Response) {
        try {
            const user = await this.getUserFromRequest(req, res);
            if (!user) return;

            const { id } = req.params;
            const { power } = req.body; // esperado: "ON" ou "OFF"

            if (!power || (power !== "ON" && power !== "OFF")) {
                return res.status(400).json({
                    error: "invalid_request",
                    error_description: "Campo 'power' deve ser 'ON' ou 'OFF'",
                });
            }

            // AQUI ESTÁ A CORREÇÃO:
            // 3. Chame o Service, que faz o 'find', 'update DB' e 'publish MQTT' de forma segura (com await).
            const result = await this.devicesService.sendPowerCommand(
                user.id,
                id,
                power
            );

            // O service já atualizou o powerState no DB, então retornamos o estado de sucesso.
            return res.json({ id, powerState: power });

        } catch (err: any) {
            console.error(err);

            // 4. Trate o erro específico de "Device não encontrado" lançado pelo Service.
            if (err.message && err.message.includes("Device não encontrado")) {
                return res.status(404).json({
                    error: "device_not_found",
                    error_description: err.message, // "Device não encontrado ou não pertence ao usuário"
                });
            }

            // 5. Erros de MQTT/outros erros internos.
            return res.status(500).json({
                error: "internal_error",
                error_description: "Could not update device power",
            });
        }
    }
}
