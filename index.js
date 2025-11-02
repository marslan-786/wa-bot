// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const { startPolling, stopPolling } = require('./bot-logic'); // ہم یہ فائل ابھی بنائیں گے

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// WhatsApp کلائنٹ کو سیٹ اپ کرنا
const client = new Client({
    authStrategy: new LocalAuth(), // سیشن کو محفوظ کرنے کے لیے
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// ویب سائٹ کے لیے 'public' فولڈر کو استعمال کرنا
app.use(express.static(path.join(__dirname, 'public')));

// جب کوئی صارف ویب سائٹ سے جڑتا ہے
io.on('connection', (socket) => {
    console.log('ایک صارف جڑ گیا:', socket.id);

    // 1. جب فرنٹ اینڈ سے پیئرنگ کوڈ کی درخواست آتی ہے
    socket.on('requestPairingCode', async (phoneNumber) => {
        if (client.info) {
             // اگر پہلے سے لاگ ان ہے تو مطلع کریں
            socket.emit('alreadyAuthenticated');
            return;
        }

        console.log(`پیئرنگ کوڈ کی درخواست برائے: ${phoneNumber}`);
        try {
            const pairingCode = await client.requestPairingCode(phoneNumber);
            console.log(`پیئرنگ کوڈ: ${pairingCode}`);
            // 2. پیئرنگ کوڈ واپس فرنٹ اینڈ کو بھیجنا
            socket.emit('pairingCode', pairingCode);
        } catch (err) {
            console.error('پیئرنگ کوڈ حاصل کرنے میں ناکامی:', err);
            socket.emit('authError', 'پیئرنگ کوڈ حاصل کرنے میں ناکامی۔');
        }
    });

    // 3. جب فرنٹ اینڈ سے بوٹ کو چالو کرنے کی درخواست آتی ہے
    socket.on('activateBot', async (groupInviteLink) => {
        if (!client.info) {
            socket.emit('authError', 'کلائنٹ لاگ ان نہیں ہے۔ پہلے تصدیق کریں۔');
            return;
        }

        try {
            // انوائٹ لنک سے گروپ جوائن کرنا
            const inviteCode = groupInviteLink.split('chat.whatsapp.com/')[1];
            const group = await client.acceptInvite(inviteCode);
            const groupId = group.id._serialized; // گروپ کی آئی ڈی حاصل کرنا
            
            console.log(`کامیابی سے گروپ میں شمولیت اختیار کی: ${groupId}`);
            
            // 4. بوٹ پولنگ شروع کرنا
            startPolling(client, groupId);
            
            // 5. فرنٹ اینڈ کو کامیابی کا پیغام بھیجنا
            socket.emit('botActivated');
            
        } catch (err) {
            console.error('گروپ جوائن کرنے یا بوٹ شروع کرنے میں ناکامی:', err);
            socket.emit('authError', 'گروپ لنک غلط ہے یا بوٹ شروع کرنے میں ناکامی۔');
        }
    });

    socket.on('disconnect', () => {
        console.log('صارف منقطع ہو گیا:', socket.id);
    });
});

// WhatsApp کلائنٹ کے ایونٹس
client.on('ready', () => {
    console.log('✅ کلائنٹ تیار ہے!');
    // جب کلائنٹ تیار ہو تو تمام جڑے ہوئے صارفین کو مطلع کریں
    io.emit('authenticated');
});

client.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILURE', msg);
    io.emit('authError', 'تصدیق ناکام ہو گئی۔ دوبارہ کوشش کریں۔');
});

client.on('disconnected', (reason) => {
    console.log('کلائنٹ منقطع ہو گیا', reason);
    io.emit('disconnected');
    stopPolling(); // پولنگ کو روکنا
});

// کلائنٹ کو شروع کرنا
client.initialize();

// سرور کو شروع کرنا
server.listen(PORT, () => {
    console.log(`سرور http://localhost:${PORT} پر چل رہا ہے`);
});
