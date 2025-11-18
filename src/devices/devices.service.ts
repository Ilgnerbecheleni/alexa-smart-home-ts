import { prisma } from "../prisma";
import { CreateDeviceSchema, CreateDeviceInput } from "./devices.schemas";
import { DeviceType, DeviceIntegration } from "@prisma/client";

export class DevicesService {
  // Lista devices do usuário
  async list(userId: string) {
    return prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }

  // Cria device para um usuário
  async create(userId: string, data: CreateDeviceInput) {
    // validação (se o controller já validou, isso é só um "double check")
    const parsed = CreateDeviceSchema.parse(data);

    const {
      name,
      description,
      endpointId,
      type,
      integration,
      topic,
      channels,
    } = parsed;

    // converte string -> enum do Prisma
    const prismaType = type as DeviceType;

    const prismaIntegration: DeviceIntegration =
      integration && integration === "CUSTOM_TOPIC"
        ? DeviceIntegration.CUSTOM_TOPIC
        : DeviceIntegration.BOARD;

    // monta o tópico final
    let finalTopic: string;

    if (prismaIntegration === DeviceIntegration.BOARD) {
      // usa sua convenção padrão
      finalTopic = `users/${userId}/devices/${endpointId}`;
    } else {
      // CUSTOM_TOPIC -> precisa ter vindo um topic válido do schema
      finalTopic = topic!.trim();
    }

    const channelCount = channels ?? 1;

    return prisma.device.create({
      data: {
        userId,
        name,
        description: description ?? null,
        endpointId,
        topic: finalTopic,
        type: prismaType,
        integration: prismaIntegration,
        channels: channelCount,
        powerState: "OFF",
      },
    });
  }

  // Atualiza power (ON/OFF) garantindo que o device é do usuário
  async updatePower(userId: string, id: string, state: "ON" | "OFF") {
    return prisma.device.update({
      where: { id },
      data: { powerState: state },
    });
  }

  // Renomeia device garantindo que é do usuário
  async renameDevice(userId: string, id: string, name: string) {
    return prisma.device.update({
      where: { id },
      data: { name },
    });
  }
}
