const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const API_ID = 30300264;
const API_HASH = '8efeedebc13b90c4b0033340c2593e67';

async function createClient(sessionString = '') {
    const client = new TelegramClient(
        new StringSession(sessionString),
        API_ID,
        API_HASH,
        { connectionRetries: 5, useWSS: true }
    );
    await client.connect();
    return client;
}

module.exports = { createClient, API_ID, API_HASH };
