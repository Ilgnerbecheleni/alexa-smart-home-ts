// src/mqtt/mqttClient.ts
import mqtt, { MqttClient } from "mqtt";
import { prisma } from "../prisma";

/** ========= Config ========= */
const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || "alexa-backend";

/** ========= Helpers de tópico ========= */
// Só caracteres seguros por segmento (ajuste se precisar)
const SEGMENT_OK = /^[A-Za-z0-9._:-]+$/;

function sanitizeBaseTopic(base: string) {
  let t = (base || "").trim();
  // remove sufixo indevido no FINAL
  t = t.replace(/\/(state|telemetry|command)$/, "");
  if (/[+#]/.test(t)) throw new Error("Topic não pode conter curingas (+/#).");
  if (t.includes("//")) throw new Error("Topic inválido (//).");

  const parts = t.split("/");
  // esperamos: users/<userId>/devices/<endpointId>
  if (parts.length < 4 || parts[0] !== "users" || parts[2] !== "devices") {
    throw new Error("Topic base inválido. Use: users/<userId>/devices/<endpointId>");
  }
  parts.forEach((p) => {
    if (!p || !SEGMENT_OK.test(p)) {
      throw new Error("Caracteres inválidos em segmento do topic.");
    }
  });
  return parts.join("/");
}

const commandTopicFromBase = (base: string) => `${sanitizeBaseTopic(base)}/command`;
const stateTopicFromBase   = (base: string) => `${sanitizeBaseTopic(base)}/state`;

/** ========= MQTT Client ========= */
let client: MqttClient;

function createClient() {
  const c = mqtt.connect(MQTT_URL, {
    clientId: MQTT_CLIENT_ID,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clean: true, // se quiser sessão persistente, troque para v5 com sessionExpiry
    // protocolVersion: 5,
    // properties: { sessionExpiryInterval: 3600 },
  });

  c.on("connect", () => {
    console.log("[MQTT] Connected to broker:", MQTT_URL);

    // Backend monitora estado reportado pelos devices (wildcard OK só aqui)
    const stateTopic = "users/+/devices/+/state";
    c.subscribe(stateTopic, { qos: 1 }, (err) => {
      if (err) {
        console.error("[MQTT] Error subscribing to", stateTopic, ":", err.message);
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
      // Esperamos:
      // topic: users/<userId>/devices/<endpointId>/state
      // payload: "ON" | "OFF"  ou  { "power": "ON" }
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
          if (typeof json.power === "string") power = json.power.toUpperCase();
        } catch {
          power = payloadStr.toUpperCase();
        }

        if (power !== "ON" && power !== "OFF") return;

        const device = await prisma.device.findFirst({
          where: { userId, endpointId },
          select: { id: true },
        });

        if (!device) {
          console.warn("[MQTT] Device not found for topic:", topic);
          return;
        }

        await prisma.device.update({
          where: { id: device.id },
          data: { powerState: power },
        });

        console.log(`[MQTT] powerState <- ${power} (endpointId=${endpointId})`);
      }
    } catch (err: any) {
      console.error("[MQTT] Error handling message:", err?.message || err);
    }
  });

  return c;
}

client = createClient();

/** ========= Publish de Comandos ========= */
/**
 * Publica comando em `${base}/command` com QoS 1.
 * @param deviceBaseTopic Ex.: users/<userId>/devices/<endpointId>
 * @param payload objeto ou string (será JSON.stringified se objeto)
 */
export function publishToDeviceCommand(deviceBaseTopic: string, payload: any) {
  if (!client || client.connected === false) {
    console.warn("[MQTT] Client not connected, cannot publish");
    return;
  }

  // Blindagem: garante base válida e acrescenta /command
  const topic = commandTopicFromBase(deviceBaseTopic);
  const message = typeof payload === "string" ? payload : JSON.stringify(payload);

  client.publish(topic, message, { qos: 1 }, (err) => {
    if (err) {
      console.error("[MQTT] Error publishing to", topic, ":", err.message);
    } else {
      console.log("[MQTT] Published to", topic, ":", message);
    }
  });
}

/**
 * Conveniência: publica power por userId + endpointId (sem depender do que veio do banco).
 */
export async function publishPowerByIds(userId: string, endpointId: string, power: "ON" | "OFF") {
  const base = sanitizeBaseTopic(`users/${userId}/devices/${endpointId}`);
  const payload = { type: "power", state: power === "ON" ? "on" : "off" };
  publishToDeviceCommand(base, payload);
}

/** Exporta o client direto, se precisar */
export { client as mqttClient, stateTopicFromBase };
