// src/app.ts
import express from "express";
import bodyParser from "body-parser";
import { AlexaController } from "./alexa/alexa.controller";
import { AuthController } from "./auth/auth.controller";
import { DevicesController } from "./devices/devices.controller";

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

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

app.get("/", (_req, res) => {
  res.send("Alexa Smart Home TS backend is running");
});

export default app;
