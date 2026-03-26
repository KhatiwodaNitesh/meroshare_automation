import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const sessionFile = path.join(__dirname, '../playwright/.auth/session.json');
const URL = process.env.URL
const DP_NAME = process.env.DP_NAME
const MS_USERNAME = process.env.MS_USERNAME
const MS_PASSWORD = process.env.MS_PASSWORD


setup('authenticate', async ({ page }) => {
    await page.goto(URL)
    await expect(page).toHaveTitle("Mero Share ")
    await page.locator('body').click();
    await page.getByText('Select your DP').click();
    await page.locator('input[type="search"]').fill(DP_NAME);
    await page.getByRole('treeitem', { name: DP_NAME }).click();
    await page.getByRole('textbox', { name: ' Username' }).click();
    await page.getByRole('textbox', { name: ' Username' }).fill(MS_USERNAME);
    await page.getByRole('textbox', { name: ' Password' }).click();
    await page.getByRole('textbox', { name: ' Password' }).fill(MS_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    const toast = page.locator('#toast-container .toast-message');
    try {
        await toast.waitFor({ state: 'visible', timeout: 2500 });
        const msg = await toast.innerText();
        throw new Error(`Login failed: ${msg.trim()}`);
    } catch (e) {
        if (e.message.startsWith('Login failed:')) throw e;
        // No toast appeared — login likely succeeded
    }

    await page.waitForLoadState('networkidle');
    await page.waitForURL('https://meroshare.cdsc.com.np/#/dashboard');

    await page.waitForLoadState('networkidle');
    console.log("✅ Successfully Signed In.")

    // Save sessionStorage to file (MeroShare stores auth token in sessionStorage)
    const sessionData = await page.evaluate(() => {
        const data = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            data[key] = sessionStorage.getItem(key);
        }
        return data;
    });
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData));
});
