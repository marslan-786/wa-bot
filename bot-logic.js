// bot-logic.js
const axios = require('axios');
const lookup = require('country-code-lookup'); // pycountry کا متبادل

const API_URL = "https://www.kamibroken.pw/api/otp?type=sms";
let last_number = null;
let pollingInterval = null;
let mainClient = null;
let mainGroupId = null;

// OTP کوڈ نکالنے کا فنکشن
function extract_otp(message) {
    let match = message.match(/\d{6}/); // پہلے 6 ہندسے
    if (match) return match[0];
    match = message.match(/\d{3}-\d{3}/); // پھر 3-3 ہندسے
    if (match) return match[0];
    match = message.match(/\d{4}/); // پھر 4 ہندسے
    if (match) return match[0];
    return "N/A";
}

// نمبر ماسک کرنے کا فنکشن
function mask_number(number_str) {
    try {
        number_str = `+${number_str}`;
        const length = number_str.length;
        if (length < 10) return number_str;
        
        const show_first = 5;
        const show_last = 4;
        const stars_count = length - show_first - show_last;
        if (stars_count <= 0) return number_str;
        
        const stars = '*'.repeat(stars_count);
        return `${number_str.substring(0, show_first)}${stars}${number_str.substring(length - show_last)}`;
    } catch (e) {
        return `+${number_str}`;
    }
}

// ملک کی معلومات اور جھنڈا حاصل کرنے کا فنکشن
function get_country_info(country_string) {
    const country_name = country_string.split('-')[0].trim();
    let flag = "🌍";
    try {
        const country_data = lookup.byCountry(country_name);
        if (country_data) {
            const country_code = country_data.iso2;
            // Emoji فلیگ بنانا
            flag = String.fromCodePoint(...country_code.split('').map(c => 0x1F1E6 - 'A'.charCodeAt(0) + c.charCodeAt(0)));
        }
    } catch (e) {
        console.error(`Flag error for ${country_name}: ${e}`);
    }
    return { country_name, flag };
}

// پیغام کو فارمیٹ کرنے کا فنکشن
function format_message(record) {
    const raw_message = record.message;
    const otp_code = extract_otp(raw_message);
    const msg = raw_message; // WhatsApp HTML کو سپورٹ نہیں کرتا (جیسے <pre>)
    
    const { country_name, flag } = get_country_info(record.country);
    const formatted_number = mask_number(record.number);

    let service_emoji = "📱";
    const service_name = record.service;
    if (service_name.toLowerCase().includes('whatsapp')) service_emoji = "🟢";
    else if (service_name.toLowerCase().includes('telegram')) service_emoji = "🔵";
    else if (service_name.toLowerCase().includes('facebook')) service_emoji = "📘";

    // ⚠️ اہم نوٹ: واٹس ایپ ٹیلیگرام کی طرح ان لائن بٹن سپورٹ نہیں کرتا۔
    // ہم لنکس کو متن کے طور پر شامل کریں گے۔
    
    return `
*${flag} New ${country_name} ${service_name} OTP!*

🕰 *Time:* ${record.time}
${flag} *Country:* ${country_name}
${service_emoji} *Service:* ${service_name}
📞 *Number:* \`\`\`${formatted_number}\`\`\`
🔑 *OTP Code:* \`\`\`${otp_code}\`\`\`

*📩 Full-Message:*
\`\`\`${msg}\`\`\`

---
*📢 Channel:* https://t.me/kami_Broken5
*🔢 Numbers:* https://t.me/Kaami_Script
*👨‍💻 Developer:* https://t.me/mr_kaamii
*🟢 WhatsApp:* https://whatsapp.com/channel/0029VbByUzNGk1G13WWbbW3M
`;
}

// تازہ ترین OTP حاصل کرنے کا فنکشن
async function fetch_latest_otp() {
    try {
        const response = await axios.get(API_URL, { timeout: 10000 });
        const data = response.data;
        const records = data.aaData || [];
        
        const valid = records.filter(r => typeof r[0] === 'string' && r[0].includes(':'));
        if (valid.length === 0) return null;

        const latest = valid[0];
        return {
            time: latest[0],
            country: latest[1],
            number: latest[2],
            service: latest[3],
            message: latest[4],
        };
    } catch (e) {
        console.error("API Error:", e.message);
        return null;
    }
}

// مرکزی پولنگ فنکشن (جو ہر 5 سیکنڈ بعد چلے گا)
async function runCheck() {
    if (!mainClient || !mainGroupId) return; // اگر کلائنٹ یا گروپ سیٹ نہیں ہے تو رک جائیں

    const otp = await fetch_latest_otp();
    if (otp) {
        const current_num = otp.number;
        if (current_num !== last_number) {
            console.log(`نیا OTP ملا برائے: ${current_num}`);
            last_number = current_num;
            const message = format_message(otp);
            try {
                await mainClient.sendMessage(mainGroupId, message, { linkPreview: true });
                console.log(`[${new Date().toLocaleString()}] OTP ${otp.number} پر بھیجا گیا`);
            } catch (e) {
                console.error("Telegram send error:", e.message);
            }
        }
    }
}

// پولنگ کو شروع کرنے کا فنکشن
async function startPolling(client, groupId) {
    if (pollingInterval) {
        clearInterval(pollingInterval); // پرانے انٹرول کو صاف کریں
    }

    mainClient = client;
    mainGroupId = groupId;
    
    console.log(`پولنگ شروع ہو رہی ہے برائے گروپ: ${groupId}`);
    
    // 1. پہلا میسج فوراً بھیجنا (جیسا کہ آپ نے کہا)
    const otp = await fetch_latest_otp();
    if (otp) {
        last_number = otp.number;
        const message = format_message(otp);
        try {
            await mainClient.sendMessage(mainGroupId, message, { linkPreview: true });
            console.log(`[${new Date().toLocaleString()}] پہلا OTP ${otp.number} پر بھیجا گیا`);
        } catch (e) {
            console.error("پہلا میسج بھیجنے میں خرابی:", e.message);
        }
    }
    
    // 2. ہر 5 سیکنڈ بعد چیکنگ شروع کرنا
    pollingInterval = setInterval(runCheck, 5000);
}

// پولنگ کو روکنے کا فنکشن
function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log('پولنگ روک دی گئی۔');
    }
}

module.exports = { startPolling, stopPolling };
