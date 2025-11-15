import { prisma } from "../prisma";

export class AlexaService {
  async discovery(userId: string) {
    const devices = await prisma.device.findMany({ where: { userId } });

    return devices.map((d) => ({
      endpointId: d.id,
      manufacturerName: "MyHome",
      friendlyName: d.name,
      description: d.description ?? "Device",
      displayCategories: [d.type],
      cookie: {},
      capabilities: [
        {
          type: "AlexaInterface",
          interface: "Alexa",
          version: "3",
        },
        {
          type: "AlexaInterface",
          interface: "Alexa.PowerController",
          version: "3",
          properties: {
            supported: [{ name: "powerState" }],
            retrievable: true,
            proactivelyReported: false,
          },
        },
      ],
    }));
  }

  async setPowerState(deviceId: string, state: "ON" | "OFF") {
    return prisma.device.update({
      where: { id: deviceId },
      data: { powerState: state },
    });
  }

  async renameDevice(deviceId: string, newName: string) {
    return prisma.device.update({
      where: { id: deviceId },
      data: { name: newName },
    });
  }

  async getDeviceState(deviceId: string) {
    return prisma.device.findUnique({ where: { id: deviceId } });
  }
}
