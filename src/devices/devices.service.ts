// src/services/devices.service.ts (dev3)

import { prisma } from "../prisma";
import { CreateDeviceSchema, CreateDeviceInput } from "./devices.schemas";
import { DeviceType, DeviceIntegration } from "@prisma/client";
import { mqttClient } from "../mqtt/mqttClient";

// ----------------- helpers de tópico -----------------
const SEGMENT_OK = /^[A-Za-z0-9._:-]+$/;

function sanitizeBaseTopic(base: string) {
  let t = (base || "").trim();
  // remove sufixos indevidos, se vierem do front
  t = t.replace(/\/(state|telemetry|command)$/, "");
  if (/[+#]/.test(t)) throw new Error("Topic não pode conter curingas (+/#).");
  if (t.includes("//")) throw new Error("Topic inválido (//).");

  const parts = t.split("/");
  if (parts.length < 4) {
    throw new Error("Topic base inválido. Ex.: users/<userId>/devices/<deviceId>");
  }
  parts.forEach((p) => {
    if (!p || !SEGMENT_OK.test(p)) throw new Error("Caracteres inválidos no topic.");
  });
  return parts.join("/");
}

function cmdTopicFromBase(base: string) {
  return `${sanitizeBaseTopic(base)}/command`;
}
function stateTopicFromBase(base: string) {
  return `${sanitizeBaseTopic(base)}/state`;
}
function telemetryTopicFromBase(base: string) {
  return `${sanitizeBaseTopic(base)}/telemetry`;
}

// ----------------- service -----------------
export class DevicesService {
  // Lista devices do usuário
  async list(userId: string) {
    return prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }

  // Cria device para um usuário (salva APENAS a base do tópico)
  async create(userId: string, data: CreateDeviceInput) {
    // double-check do schema
    const parsed = CreateDeviceSchema.parse(data);
    const { name, description, endpointId, type, integration, topic, channels } = parsed;

    const prismaType = type as DeviceType;
    const prismaIntegration: DeviceIntegration =
      integration === "CUSTOM_TOPIC" ? DeviceIntegration.CUSTOM_TOPIC : DeviceIntegration.BOARD;

    let finalTopicBase: string;
    if (prismaIntegration === DeviceIntegration.BOARD) {
      finalTopicBase = sanitizeBaseTopic(`users/${userId}/devices/${endpointId}`);
    } else {
      if (!topic) throw new Error("topic é obrigatório para CUSTOM_TOPIC");
      finalTopicBase = sanitizeBaseTopic(topic);
    }

    const channelCount = channels ?? 1;

    return prisma.device.create({
      data: {
        userId,
        name,
        description: description ?? null,
        endpointId,
        topic: finalTopicBase, // **só a base**
        type: prismaType,
        integration: prismaIntegration,
        channels: channelCount,
        powerState: "OFF",
      },
    });
  }

  // (Opcional) recalcula os tópicos derivados, útil pra debug / retornos
  deriveTopics(device: { topic: string }) {
    return {
      base: sanitizeBaseTopic(device.topic),
      state: stateTopicFromBase(device.topic),
      telemetry: telemetryTopicFromBase(device.topic),
      command: cmdTopicFromBase(device.topic),
    };
  }

  // Envia comando de power para o device (publica no MQTT)
  async sendPowerCommand(userId: string, deviceId: string, state: "ON" | "OFF") {
    const device = await prisma.device.findFirst({
      where: { id: deviceId, userId }, // garante que o device é do usuário
    });
    if (!device) throw new Error("Device não encontrado ou não pertence ao usuário");

    const topic = cmdTopicFromBase(device.topic); // base -> /command
    const payload = JSON.stringify({ type: "power", state: state === "ON" ? "on" : "off" });

    await new Promise<void>((resolve, reject) => {
      mqttClient.publish(topic, payload, { qos: 1 }, (err?: Error) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // opcional: refletir estado na base (se quiser)
    await prisma.device.update({
      where: { id: device.id },
      data: { powerState: state },
    });

    return { topic, payload };
  }

  // Atualiza power no banco (sem publicar) — mantenho caso você use em outra rota
  async updatePower(userId: string, id: string, state: "ON" | "OFF") {
    // garante ownership
    const dev = await prisma.device.findFirst({ where: { id, userId } });
    if (!dev) throw new Error("Device não encontrado ou não pertence ao usuário");
    return prisma.device.update({
      where: { id },
      data: { powerState: state },
    });
  }

  // Renomeia device garantindo que é do usuário
  async renameDevice(userId: string, id: string, name: string) {
    const dev = await prisma.device.findFirst({ where: { id, userId } });
    if (!dev) throw new Error("Device não encontrado ou não pertence ao usuário");
    return prisma.device.update({
      where: { id },
      data: { name },
    });
  }
}
