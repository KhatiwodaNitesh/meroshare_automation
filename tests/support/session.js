import fs from 'fs';
import path from 'path';
import { SESSION_FILE } from './config';

export function readSession() {
    if (!fs.existsSync(SESSION_FILE)) {
        throw new Error(
            `Session file not found at ${SESSION_FILE}. Run the auth setup test first to generate it.`
        );
    }

    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
}

export function writeSession(sessionData) {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
}

export async function captureSessionStorage(page) {
    return page.evaluate(() => {
        const data = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            data[key] = sessionStorage.getItem(key);
        }
        return data;
    });
}

export async function injectSession(page, sessionData) {
    await page.addInitScript((data) => {
        for (const [key, value] of Object.entries(data)) {
            window.sessionStorage.setItem(key, value);
        }
    }, sessionData);
}
