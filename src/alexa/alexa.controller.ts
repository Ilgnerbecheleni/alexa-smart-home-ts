import { Request, Response } from "express";
import { AlexaService } from "./alexa.service";
import { AuthService } from "../auth/auth.service";
import { AlexaRequestSchema } from "./alexa.schemas";
import { zodError } from "../utils/zodError";

const alexaService = new AlexaService();
const authService = new AuthService();

export class AlexaController {
  async handle(req: Request, res: Response) {
    // 1. validar request
    let parsed;
    try {
      parsed = AlexaRequestSchema.parse(req.body);
    } catch (err) {
      return res.status(400).json(zodError(err));
    }

    const directive = parsed.directive;
    const header = directive.header;

    // 2. extrair token
    const token =
      (directive.payload as any)?.scope?.token ??
      directive.endpoint?.scope?.token;

    if (!token) {
      return this.errorResponse(res, header, "INVALID_AUTHORIZATION_CREDENTIAL", "Missing token");
    }

    // 3. validar token via prisma
    const auth = await authService.validateAccessToken(token);
    if (!auth) {
      return this.errorResponse(res, header, "INVALID_AUTHORIZATION_CREDENTIAL", "Invalid token");
    }

    const userId = auth.userId;

    // 4. roteamento por namespace
    switch (header.namespace) {
      case "Alexa.Discovery":
        return this.handleDiscovery(res, header, userId);

      case "Alexa.PowerController":
        return this.handlePowerController(res, directive, header);

      case "Alexa":
        if (header.name === "ChangeReport") {
          return this.handleRenameDirective(res, directive, header, userId);
        }
        return this.errorResponse(res, header, "INVALID_DIRECTIVE", "Unsupported Alexa directive");

      default:
        return this.errorResponse(res, header, "INVALID_DIRECTIVE", "Directive not implemented");
    }
  }

  // --------- Discovery ----------

  async handleDiscovery(res: Response, header: any, userId: string) {
    const endpoints = await alexaService.discovery(userId);

    return res.json({
      event: {
        header: {
          namespace: "Alexa.Discovery",
          name: "Discover.Response",
          payloadVersion: "3",
          messageId: header.messageId,
        },
        payload: { endpoints },
      },
    });
  }

  // --------- PowerController ----------

  async handlePowerController(res: Response, directive: any, header: any) {
    const deviceId = directive.endpoint.endpointId;
    const newState = header.name === "TurnOn" ? "ON" : "OFF";

    await alexaService.setPowerState(deviceId, newState);

    return res.json({
      context: {
        properties: [
          {
            namespace: "Alexa.PowerController",
            name: "powerState",
            value: newState,
            timeOfSample: new Date().toISOString(),
            uncertaintyInMilliseconds: 500,
          },
        ],
      },
      event: {
        header: {
          namespace: "Alexa",
          name: "Response",
          payloadVersion: "3",
          messageId: header.messageId,
          correlationToken: header.correlationToken,
        },
        endpoint: {
          endpointId: deviceId,
        },
        payload: {},
      },
    });
  }

  // --------- Rename (ChangeReport) ----------

  async handleRenameDirective(res: Response, directive: any, header: any, _userId: string) {
    const deviceId = directive.endpoint?.endpointId;
    if (!deviceId) {
      return this.errorResponse(res, header, "INVALID_VALUE", "Missing endpointId");
    }

    const change = (directive.payload as any)?.change;
    if (!change || !change.properties) {
      return this.errorResponse(res, header, "INVALID_VALUE", "Missing change properties");
    }

    const friendlyProp = change.properties.find((p: any) => p.name === "friendlyName");
    if (!friendlyProp) {
      return this.errorResponse(res, header, "INVALID_VALUE", "friendlyName not found in change properties");
    }

    const newName = friendlyProp.value;
    await alexaService.renameDevice(deviceId, newName);

    const timeOfSample = new Date().toISOString();

    return res.json({
      context: {
        properties: [
          {
            namespace: "Alexa",
            name: "friendlyName",
            value: newName,
            timeOfSample,
            uncertaintyInMilliseconds: 0,
          },
        ],
      },
      event: {
        header: {
          namespace: "Alexa",
          name: "ChangeReport",
          payloadVersion: "3",
          messageId: header.messageId,
          correlationToken: header.correlationToken,
        },
        endpoint: {
          endpointId: deviceId,
        },
        payload: {
          change: {
            cause: {
              type: "APP_INTERACTION",
            },
            properties: [
              {
                namespace: "Alexa",
                name: "friendlyName",
                value: newName,
                timeOfSample,
                uncertaintyInMilliseconds: 0,
              },
            ],
          },
        },
      },
    });
  }

  // --------- Helper de erro ----------

  errorResponse(res: Response, header: any, type: string, message: string) {
    return res.json({
      event: {
        header: {
          namespace: "Alexa",
          name: "ErrorResponse",
          payloadVersion: "3",
          messageId: header?.messageId ?? "err",
        },
        payload: {
          type,
          message,
        },
      },
    });
  }
}
