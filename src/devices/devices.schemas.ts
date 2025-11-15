// src/devices/devices.schemas.ts
import { z } from "zod";

export const DeviceTypeSchema = z.enum([
  "LIGHT",
  "TV",
  "THERMOSTAT",
  "DOOR",
]);

export const DeviceIntegrationSchema = z.enum(["BOARD", "CUSTOM_TOPIC"]);

export const CreateDeviceSchema = z
  .object({
    name: z.string().min(1, "name é obrigatório"),
    description: z.string().optional(),

    endpointId: z.string().min(1, "endpointId é obrigatório"),

    type: DeviceTypeSchema,

    integration: DeviceIntegrationSchema.default("BOARD"),

    topic: z.string().optional(),

    channels: z
      .coerce.number()
      .int("channels deve ser inteiro")
      .min(1, "channels mínimo é 1")
      .max(32, "channels máximo é 32")
      .optional()
      .default(1),
  })
  .superRefine((data, ctx) => {
    if (data.integration === "CUSTOM_TOPIC") {
      if (!data.topic || data.topic.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["topic"],
          message:
            "Para integration = CUSTOM_TOPIC, o campo 'topic' é obrigatório",
        });
      }
    }
  });

export type CreateDeviceInput = z.infer<typeof CreateDeviceSchema>;
export type DeviceTypeInput = z.infer<typeof DeviceTypeSchema>;
export type DeviceIntegrationInput = z.infer<typeof DeviceIntegrationSchema>;
