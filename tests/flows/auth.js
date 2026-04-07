import { expect } from '@playwright/test';
import { AUTH_ENV, appRoute } from '../support/config';
import { captureSessionStorage, writeSession } from '../support/session';

export async function loginAndPersistSession(page) {
    await page.goto(appRoute(), { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle('Mero Share ');
    await page.locator('body').click();
    await page.getByText('Select your DP').click();
    await page.locator('input[type="search"]').fill(AUTH_ENV.dpName);
    await page.getByRole('treeitem', { name: AUTH_ENV.dpName }).click();
    await page.getByRole('textbox', { name: ' Username' }).fill(AUTH_ENV.username);
    await page.getByRole('textbox', { name: ' Password' }).fill(AUTH_ENV.password);
    await page.getByRole('button', { name: 'Login' }).click();

    const toast = page.locator('#toast-container .toast-message');
    try {
        await toast.waitFor({ state: 'visible', timeout: 2500 });
        const message = await toast.innerText();
        throw new Error(`Login failed: ${message.trim()}`);
    } catch (error) {
        if (error.message.startsWith('Login failed:')) throw error;
    }

    await page.waitForURL(/#\/dashboard$/, { timeout: 30000 });
    await expect(page.getByRole('link', { name: /my asba/i })).toBeVisible({ timeout: 30000 });

    const sessionData = await captureSessionStorage(page);
    writeSession(sessionData);
    console.log('Successfully signed in.');
}
