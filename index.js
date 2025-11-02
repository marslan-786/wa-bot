import express from "express";
import qrcode from "qrcode";
import axios from "axios";
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";

const API_URL = "https://www.kamibroken.pw/api/otp?type=sms";
let sock = null;
let groupJid = null;
let active = false;
let lastNumber = null;

const app = express();
app.use(express.json());
app.use(express.static("public"));

const port = process.env.PORT || 3000;

// =========================
// STEP 1: Generate Pairing Code
// =========================
app.post("/pair", async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: "Number required" });

    const { state, saveCreds } = await useMultiFileAuthState("./auth");
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (update) => {
      const { connection } = update;
      if (connection === "open") console.log("✅ WhatsApp Connected!");
    });

    const code = await sock.requestPairingCode(number);
    console.log(`Pairing code for ${number}: ${code}`);
    res.json({ code });
  } catch (e) {
    console.error("Pair Error:", e);
    res.status(500).json({ error: "Failed to get pairing code" });
  }
});

// =========================
// STEP 2: Join Group
// =========================
app.post("/join", async (req, res) => {
  try {
    const { link } = req.body;
    if (!sock) return res.json({ error: "Not connected yet" });
    const invite = link.split("/").pop();
    const jid = await sock.groupAcceptInvite(invite);
    groupJid = jid;
    res.json({ success: true, jid });
  } catch (e) {
    console.error("Join error:", e);
    res.json({ success: false, msg: "Failed to join group" });
  }
});

// =========================
// STEP 3: Activate / Stop
// =========================
app.post("/control", async (req, res) => {
  const { state } = req.body;
  active = state === "start";
  res.json({ active });
  console.log("Bot", active ? "Activated ✅" : "Stopped 🛑");
});

// =========================
// API Loop
// =========================
async function fetchOtpLoop() {
  while (true) {
    if (active && sock && groupJid) {
      try {
        const { data } = await axios.get(API_URL);
        const rows = data.aaData;
        if (Array.isArray(rows) && rows.length) {
          const latest = rows[0];
          const number = latest[2];
          if (number !== lastNumber) {
            lastNumber = number;
            const msg = `📢 *New OTP!*\n\n🕐 ${latest[0]}\n🌍 ${latest[1]}\n📞 ${number}\n💬 ${latest[3]}\n🔑 ${latest[4]}`;
            await sock.sendMessage(groupJid, { text: msg });
            console.log("📨 Sent new OTP to group");
          }
        }
      } catch (e) {
        console.log("API loop error:", e.message);
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// =========================
app.listen(port, () => {
  console.log(`🌍 Server running at http://localhost:${port}`);
  fetchOtpLoop();
});
