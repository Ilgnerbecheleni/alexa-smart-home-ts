// src/app.ts
import express from "express";
import bodyParser from "body-parser";
import { AlexaController } from "./alexa/alexa.controller";
import { AuthController } from "./auth/auth.controller";
import { DevicesController } from "./devices/devices.controller";
import cors from 'cors';
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

const alexa = new AlexaController();
const auth = new AuthController();
const devices = new DevicesController();

// ------------- AUTH / OAUTH -------------
app.get("/oauth/authorize", auth.authorize.bind(auth));
app.post("/oauth/token", auth.token.bind(auth));

app.post("/auth/register", auth.register.bind(auth));
app.post("/auth/login", auth.login.bind(auth));

app.get("/auth/confirm-email", auth.confirmEmail.bind(auth)); // <- NOVO
app.post("/auth/forgot-password", auth.requestPasswordReset.bind(auth));
app.post("/auth/reset-password", auth.resetPassword.bind(auth));

// ------------- DEVICES REST API -------------
app.get("/devices", devices.list.bind(devices));
app.post("/devices", devices.create.bind(devices));
app.patch("/devices/:id/power", devices.updatePower.bind(devices));

const startTime = new Date(); 

// Função auxiliar para formatar o tempo de atividade
function formatUptime(seconds:number) {
    function pad(s:number) {
        return (s < 10 ? '0' : '') + s;
    }
    const days = Math.floor(seconds / (3600 * 24));
    seconds %= (3600 * 24);
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    
    let result = '';
    if (days > 0) result += days + 'd ';
    result += pad(hours) + 'h ' + pad(minutes) + 'm ' + pad(seconds) + 's';
    return result.trim();
}


app.get("/health", (_req, res) => {
    // Calcula o tempo de atividade da aplicação (uptime) em segundos
    const uptimeSeconds = process.uptime();
    
    // Obtém a hora atual e a hora de início
    const currentTime = new Date();
    
    const healthInfo = {
        status: "UP",
        service: "Alexa Smart Home TS Backend",
        version: "1.0", // Pega a versão do package.json se estiver disponível
        currentTime: currentTime.toISOString(),
        startTime: startTime.toISOString(),
        uptimeFormatted: formatUptime(uptimeSeconds),
        uptimeSeconds: Math.floor(uptimeSeconds)
    };

    // Responde com o status 200 (OK) e os dados formatados
    res.status(200).json(healthInfo);
});

export default app;
