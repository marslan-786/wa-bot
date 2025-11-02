import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import axios from "axios";
import express from "express";

const API_URL = "https://www.kamibroken.pw/api/otp?type=sms";
let lastNumber = null;
let groupJid = null;

const app = express();
app.use(express.json());
app.use(express.static("public"));

let sock; // global socket

// ========== INIT WHATSAPP ==========
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection } = update;
    if (connection === "open") {
      console.log("✅ WhatsApp connected!");
    } else if (connection === "close") {
      console.log("❌ Connection closed. Reconnecting...");
      startBot();
    }
  });
}

// ========== GROUP JOIN ==========
app.post("/join-group", async (req, res) => {
  try {
    const link = req.body.link;
    if (!link) return res.json({ success: false, msg: "No group link provided" });

    const code = link.split("/").pop();
    const jid = await sock.groupAcceptInvite(code);
    groupJid = jid;
    console.log("✅ Joined Group:", groupJid);
    res.json({ success: true, jid });
  } catch (e) {
    console.log("Join group error:", e);
    res.json({ success: false, msg: "Failed to join group" });
  }
});

// ========== FETCH OTP ==========
async function fetchLatestOtp() {
  try {
    const res = await axios.get(API_URL);
    const data = res.data.aaData;
    if (!Array.isArray(data) || !data.length) return null;

    const latest = data[0];
    return {
      time: latest[0],
      country: latest[1],
      number: latest[2],
      service: latest[3],
      message: latest[4],
    };
  } catch (err) {
    console.log("API Error:", err.message);
    return null;
  }
}

// ========== SEND MESSAGE ==========
async function sendToGroup(msg) {
  if (!sock || !groupJid) return console.log("❌ Group not joined yet.");
  try {
    await sock.sendMessage(groupJid, { text: msg });
    console.log("✅ Sent message to group");
  } catch (err) {
    console.log("Send error:", err.message);
  }
}

// ========== LOOP ==========
async function loopApiCheck() {
  while (true) {
    const otp = await fetchLatestOtp();
    if (otp && otp.number !== lastNumber) {
      lastNumber = otp.number;
      const text = `📢 *New OTP Alert*\n\n🕐 ${otp.time}\n🌍 ${otp.country}\n📞 ${otp.number}\n🔑 ${otp.message}`;
      await sendToGroup(text);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ========== START ==========
app.listen(3000, async () => {
  console.log("🌐 Web Server running on http://localhost:3000");
  await startBot();
  loopApiCheck();
});
