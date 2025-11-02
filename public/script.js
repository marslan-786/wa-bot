// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // صفحات
    const authPage = document.getElementById('authPage');
    const pairingPage = document.getElementById('pairingPage');
    const dashboardPage = document.getElementById('dashboardPage');

    // عناصر
    const getCodeButton = document.getElementById('getCodeButton');
    const phoneNumberInput = document.getElementById('phoneNumber');
    const authStatus = document.getElementById('authStatus');
    const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
    const pairingStatus = document.getElementById('pairingStatus');
    const activateButton = document.getElementById('activateButton');
    const groupLinkInput = document.getElementById('groupLink');
    const dashboardStatus = document.getElementById('dashboardStatus');

    // صفحہ دکھانے کا فنکشن
    function showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }

    // 1. پیئرنگ کوڈ کی درخواست
    getCodeButton.addEventListener('click', () => {
        const phoneNumber = phoneNumberInput.value;
        if (phoneNumber) {
            authStatus.textContent = "درخواست بھیجی جا رہی ہے...";
            socket.emit('requestPairingCode', phoneNumber);
        } else {
            authStatus.textContent = "براہ کرم فون نمبر درج کریں۔";
        }
    });

    // 2. جب پیئرنگ کوڈ موصول ہو
    socket.on('pairingCode', (code) => {
        pairingCodeDisplay.textContent = code;
        showPage('pairingPage');
    });

    // 3. جب تصدیق مکمل ہو (فون سے کوڈ داخل کرنے کے بعد)
    socket.on('authenticated', () => {
        showPage('dashboardPage');
    });
    
    // اگر پہلے سے لاگ ان ہے
    socket.on('alreadyAuthenticated', () => {
        showPage('dashboardPage');
    });

    // 4. بوٹ کو فعال کرنا
    activateButton.addEventListener('click', () => {
        const groupLink = groupLinkInput.value;
        if (groupLink && groupLink.includes('chat.whatsapp.com/')) {
            dashboardStatus.textContent = "بوٹ کو فعال کیا جا رہا ہے...";
            socket.emit('activateBot', groupLink);
        } else {
            dashboardStatus.textContent = "براہ کرم درست گروپ انوائٹ لنک درج کریں۔";
        }
    });

    // 5. جب بوٹ فعال ہو جائے
    socket.on('botActivated', () => {
        dashboardStatus.textContent = "بوٹ کامیابی سے فعال ہو گیا ہے اور گروپ میں پیغامات بھیج رہا ہے!";
        activateButton.disabled = true;
    });

    // غلطیاں
    socket.on('authError', (message) => {
        showPage('authPage'); // واپس لاگ ان صفحہ پر
        authStatus.textContent = message;
        pairingStatus.textContent = message;
        dashboardStatus.textContent = message;
    });

    socket.on('disconnected', () => {
        showPage('authPage');
        authStatus.textContent = "بوٹ منقطع ہو گیا ہے۔ دوبارہ لاگ ان کریں۔";
    });

});
