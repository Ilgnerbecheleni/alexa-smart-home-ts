import { prisma } from "../prisma";
import { CreateDeviceSchema, CreateDeviceInput } from "./devices.schemas";

export class DevicesService {
  async list(userId: string) {
    return prisma.device.findMany({ where: { userId } });
  }

  async create(userId: string, data: CreateDeviceInput) {
    // validação extra (já validada no controller, mas não custa)
    CreateDeviceSchema.parse(data);

    return prisma.device.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        type: data.type,
        powerState: "OFF",
      },
    });
  }

  async updatePower(id: string, state: "ON" | "OFF") {
    return prisma.device.update({
      where: { id },
      data: { powerState: state },
    });
  }

  async renameDevice(id: string, name: string) {
    return prisma.device.update({
      where: { id },
      data: { name },
    });
  }
}
