import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys"
import pino from "pino"
import axios from "axios"
import fs from "fs"

const API_URL = "https://www.kamibroken.pw/api/otp?type=sms"
let lastNumber = null

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session")
  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    logger: pino({ level: "silent" })
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    } else if (connection === "open") {
      console.log("✅ WhatsApp bot connected!")
      fetchAndSend(sock)
      setInterval(() => fetchAndSend(sock), 5000)
    }
  })
}

async function fetchAndSend(sock) {
  try {
    const res = await axios.get(API_URL)
    const records = res.data.aaData
    if (!records || !records.length) return

    const latest = records[0]
    const number = latest[2]
    if (number === lastNumber) return
    lastNumber = number

    const otp = extractOTP(latest[4])
    const msg = `
🔔 *New OTP Received!*

🕐 *Time:* ${latest[0]}
🌍 *Country:* ${latest[1]}
📱 *Service:* ${latest[3]}
📞 *Number:* ${maskNumber(number)}
🔑 *OTP:* ${otp}

📩 *Message:*
${latest[4]}

━━━━━━━━━━━━━━
📋 *Copy OTP:* ${otp}
📢 *Main Channel:* https://wa.me/1234567890
👥 *Main Group:* https://chat.whatsapp.com/xxxxx
━━━━━━━━━━━━━━
`

    // یہاں اپنا نمبر لگائیں
    const sendTo = "923001234567@s.whatsapp.net"
    await sock.sendMessage(sendTo, { text: msg })
    console.log(`[SENT] OTP sent for ${number}`)
  } catch (err) {
    console.log("Fetch/Send Error:", err.message)
  }
}

function extractOTP(text) {
  const match = text.match(/\d{4,6}/)
  return match ? match[0] : "N/A"
}

function maskNumber(num) {
  const s = num.toString()
  return s.slice(0, 4) + "****" + s.slice(-2)
}

startBot()
