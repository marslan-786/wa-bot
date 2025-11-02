// index.js
import express from "express";
import path from "path";
import fs from "fs-extra";
import axios from "axios";
import pino from "pino";
import qrcode from "qrcode";
import { fileURLToPath } from "url";
import {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const API_URL = "https://www.kamibroken.pw/api/otp?type=sms"; // change if needed

// runtime state
let sock = null;
let currentNumber = null; // sanitized number string (e.g. 92300...)
let sessionBase = path.join(process.cwd(), "session");
let groupJid = null;
let active = false;
let lastOtpNumber = null;

// helper to sanitize +923... => 923...
function sanitizeNumber(n) {
  return n.replace(/\D/g, "");
}

async function createSocketForNumber(number) {
  // number is sanitized (only digits)
  const sessionPath = path.join(sessionBase, `session_${number}`);
  fs.ensureDirSync(sessionPath);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: "silent" });
  // use latest Baileys version if available
  let version = undefined;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
  } catch (e) {
    // ignore
  }

  const sockLocal = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS("Safari"),
    version
  });

  sockLocal.ev.on("creds.update", saveCreds);

  sockLocal.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      console.log("✅ WhatsApp connected for", number);
    } else if (connection === "close") {
      console.log("❌ Connection closed for", number);
      // if logged out, remove session folder so next time requestPairingCode can run
      if (lastDisconnect?.error?.output?.statusCode === 401) {
        console.log("session logged out, clearing session files");
        try { fs.removeSync(sessionPath); } catch(e){}
      }
    }
  });

  return sockLocal;
}

// Endpoint: POST /pair { number: "+92300123..." }
app.post("/pair", async (req, res) => {
  try {
    let { number } = req.body;
    if (!number) return res.status(400).json({ error: "number required" });

    // require plus at start per your requirement; we accept with or without +
    number = number.trim();
    if (!number.startsWith("+")) {
      return res.status(400).json({ error: "number must start with + and country code" });
    }
    const sanitized = sanitizeNumber(number);

    // create socket (or reuse if same number)
    if (!sock || currentNumber !== sanitized) {
      // create new
      sock = await createSocketForNumber(sanitized);
      currentNumber = sanitized;
    }

    // if already registered (session exists), return status
    const registered = sock?.authState?.creds?.registered;
    if (registered) {
      return res.json({ status: "connected", message: "Already paired/connected" });
    }

    // request pairing code (Baileys MD pairing)
    try {
      const code = await sock.requestPairingCode(sanitized);
      // return code to frontend. code may be string or object depending on version
      // convert to string if needed
      const codeText = typeof code === "string" ? code : JSON.stringify(code);
      return res.json({ status: "pair_code", code: codeText });
    } catch (err) {
      console.error("requestPairingCode error:", err?.message || err);
      return res.status(500).json({ error: "Failed to request pairing code", detail: err?.toString() });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal" });
  }
});

// Endpoint: GET /status -> returns { connected: true/false, number }
app.get("/status", (req, res) => {
  const connected = !!(sock && sock.authState && sock.authState.creds && sock.authState.creds.registered);
  res.json({ connected, number: currentNumber });
});

// Endpoint: POST /join-group { link: "https://chat.whatsapp.com/xxxxx" }
app.post("/join-group", async (req, res) => {
  try {
    const { link } = req.body;
    if (!link) return res.status(400).json({ error: "group link required" });
    if (!sock) return res.status(400).json({ error: "socket not initialized" });

    const code = link.split("/").pop();
    try {
      const result = await sock.groupAcceptInvite(code);
      groupJid = result; // returns group jid
      console.log("Joined group:", groupJid);
      return res.json({ success: true, jid: groupJid });
    } catch (err) {
      console.error("groupAcceptInvite error:", err?.message || err);
      return res.status(500).json({ success: false, msg: "Failed to join group", detail: err?.toString() });
    }
  } catch (e) {
    res.status(500).json({ error: "internal" });
  }
});

// Endpoint: POST /control { action: "start"|"stop" }
app.post("/control", async (req, res) => {
  const { action } = req.body;
  if (action === "start") {
    active = true;
    res.json({ active: true });
  } else {
    active = false;
    res.json({ active: false });
  }
});

// core loop: poll API every 5 seconds when active and send to group
async function pollLoop() {
  while (true) {
    try {
      if (active && sock && groupJid) {
        let resp = await axios.get(API_URL, { timeout: 8000 });
        const rows = resp?.data?.aaData;
        if (Array.isArray(rows) && rows.length > 0) {
          const latest = rows[0];
          const number = latest[2];
          if (number !== lastOtpNumber) {
            lastOtpNumber = number;
            const time = latest[0];
            const country = latest[1];
            const serv = latest[3];
            const message = latest[4];
            const otpMatch = (message||"").match(/\d{4,6}/);
            const otp = otpMatch ? otpMatch[0] : "N/A";

            const text = [
              `🔔 *New OTP Received!*`,
              ``,
              `🕐 Time: ${time}`,
              `🌍 Country: ${country}`,
              `📱 Service: ${serv}`,
              `📞 Number: +${number}`,
              `🔑 OTP: ${otp}`,
              ``,
              `📩 Message:\n${message}`,
              ``,
              `━━━━━━━━━━━━━━━━━━━━`,
              `📋 Copy OTP: ${otp}`,
              `📢 Main Channel: https://t.me/kami_Broken5`,
              `👥 Main Group: ${groupJid ? "Joined group (see above)" : "Not joined"}`,
              `━━━━━━━━━━━━━━━━━━━━`
            ].join("\n");

            // send as text to groupJid
            try {
              await sock.sendMessage(groupJid, { text });
              console.log("Sent OTP to group:", otp);
            } catch (sendErr) {
              console.error("sendMessage error:", sendErr?.message || sendErr);
            }
          }
        }
      }
    } catch (e) {
      // ignore network or API errors, log minimal
      // console.error("pollLoop error:", e?.message || e);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

// start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  // ensure session base exists
  fs.ensureDirSync(sessionBase);
  pollLoop(); // start background loop
});
