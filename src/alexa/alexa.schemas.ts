import { z } from "zod";

export const AlexaHeaderSchema = z.object({
  namespace: z.string(),
  name: z.string(),
  payloadVersion: z.string(),
  messageId: z.string(),
  correlationToken: z.string().optional(),
});

export const AlexaScopeSchema = z.object({
  type: z.literal("BearerToken"),
  token: z.string(),
});

export const AlexaEndpointSchema = z.object({
  endpointId: z.string(),
  scope: AlexaScopeSchema.optional(),
});

export const AlexaDirectiveSchema = z.object({
  header: AlexaHeaderSchema,
  endpoint: AlexaEndpointSchema.optional(),
  payload: z.unknown(),
});

export const AlexaRequestSchema = z.object({
  directive: AlexaDirectiveSchema,
});

export type AlexaHeader = z.infer<typeof AlexaHeaderSchema>;
export type AlexaScope = z.infer<typeof AlexaScopeSchema>;
export type AlexaEndpoint = z.infer<typeof AlexaEndpointSchema>;
export type AlexaDirective = z.infer<typeof AlexaDirectiveSchema>;
export type AlexaRequest = z.infer<typeof AlexaRequestSchema>;
