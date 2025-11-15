// src/mqtt/mqttClient.ts
import mqtt, { MqttClient } from "mqtt";
import { prisma } from "../prisma";

const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || "alexa-backend";

let client: MqttClient;

// Inicializa e conecta o cliente MQTT
function createClient() {
  const c = mqtt.connect(MQTT_URL, {
    clientId: MQTT_CLIENT_ID,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clean: true,
  });

  c.on("connect", () => {
    console.log("[MQTT] Connected to broker:", MQTT_URL);

    // Backend monitora estado reportado pelos devices
    const stateTopic = "users/+/devices/+/state";
    c.subscribe(stateTopic, (err) => {
      if (err) {
        console.error("[MQTT] Error subscribing to state topic:", err.message);
      } else {
        console.log("[MQTT] Subscribed to", stateTopic);
      }
    });
  });

  c.on("error", (err) => {
    console.error("[MQTT] Connection error:", err.message);
  });

  c.on("reconnect", () => {
    console.log("[MQTT] Reconnecting...");
  });

  // Quando um device publicar seu estado, atualizamos o powerState no banco
  c.on("message", async (topic, payloadBuffer) => {
    try {
      const payloadStr = payloadBuffer.toString();
      // Esperamos algo tipo:
      // topic: users/<userId>/devices/<endpointId>/state
      // payload: "ON" ou "OFF" ou { "power": "ON" }
      const parts = topic.split("/"); // ["users", "<userId>", "devices", "<endpointId>", "state"]

      if (
        parts.length >= 5 &&
        parts[0] === "users" &&
        parts[2] === "devices" &&
        parts[4] === "state"
      ) {
        const userId = parts[1];
        const endpointId = parts[3];

        let power: string | undefined;

        try {
          const json = JSON.parse(payloadStr);
          if (typeof json.power === "string") {
            power = json.power;
          }
        } catch {
          // não é JSON, considera string pura
          power = payloadStr;
        }

        if (!power || (power !== "ON" && power !== "OFF")) {
          // ignora se não for um valor esperado
          return;
        }

        // Atualiza o device correspondente
        const device = await prisma.device.findFirst({
          where: {
            userId,
            endpointId,
          },
        });

        if (!device) {
          console.warn("[MQTT] Device not found for topic:", topic);
          return;
        }

        await prisma.device.update({
          where: { id: device.id },
          data: { powerState: power },
        });

        console.log(
          `[MQTT] Updated device powerState from MQTT: endpointId=${endpointId}, power=${power}`,
        );
      }
    } catch (err: any) {
      console.error("[MQTT] Error handling message:", err?.message || err);
    }
  });

  return c;
}

// Cria o cliente ao carregar o módulo
client = createClient();

// Função para publicar comando para um device
export function publishToDeviceCommand(deviceTopic: string, payload: any) {
  if (!client || client.connected === false) {
    console.warn("[MQTT] Client not connected, cannot publish");
    return;
  }

  const topic = `${deviceTopic}/command`;
  const message =
    typeof payload === "string" ? payload : JSON.stringify(payload);

  client.publish(topic, message, { qos: 0 }, (err) => {
    if (err) {
      console.error("[MQTT] Error publishing to", topic, ":", err.message);
    } else {
      console.log("[MQTT] Published to", topic, ":", message);
    }
  });
}

// Exporta o client caso você queira usar direto em outro lugar
export { client as mqttClient };
