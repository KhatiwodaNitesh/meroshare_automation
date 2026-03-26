import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// --- Constants ---
const BASE_URL = process.env.URL + '#/';
const SESSION_FILE = path.join(__dirname, '../playwright/.auth/session.json');

const ENV = {
    bankName: process.env.DMAT_BANK_NAME,
    kitta: process.env.KITTA_NO,
    crn: process.env.CRN_NO,
    transactionPin: process.env.TRANS_PIN,
};

// --- Session Setup ---
test.beforeEach(async ({ page }) => {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    // Inject session before every page load (addInitScript fires before Angular boots)
    await page.addInitScript((data) => {
        for (const [key, value] of Object.entries(data)) {
            window.sessionStorage.setItem(key, value);
        }
    }, session);
    // Navigate to base URL first so Angular initializes as authenticated
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
});

// --- Helper: Select bank from dropdown ---
async function selectBank(page) {
    await page.locator('#selectBank').selectOption({ label: new RegExp(ENV.bankName, 'i') });
    await expect(page.locator('#selectBank')).toContainText(ENV.bankName);
}

// --- Helper: Navigate to My ASBA page ---
async function goToASBA(page) {
    await page.goto(`${BASE_URL}dashboard`);
    await page.getByRole('link', { name: 'My ASBA' }).click();
    await expect(page).toHaveURL(/asba/);
}

// --- Helper: Apply for a single share ---
async function applyForShare(page, share) {
    await goToASBA(page);

    // Find the company row and click Apply button
    const companyRow = page.locator('.company-list').filter({
        has: page.locator('.company-name span[tooltip="Company Name"]', { hasText: share.companyName }),
    });
    await expect(companyRow.locator('.company-name span[tooltip="Company Name"]')).toBeVisible();
    await companyRow.locator('.action-buttons button').click();

    await page.waitForTimeout(1000);

    // Fill application form
    await selectBank(page);

    const accountValue = await page.locator('#accountNumber option').nth(1).getAttribute('value');
    await page.selectOption('#accountNumber', accountValue);

    await page.fill('#appliedKitta', ENV.kitta);
    await expect(page.locator('#appliedKitta')).toHaveValue(ENV.kitta);

    await page.fill('#crnNumber', ENV.crn);

    await page.check('#disclaimer');
    await expect(page.locator('#disclaimer')).toBeChecked();

    await page.getByRole('button', { name: /proceed/i }).click();

    // Wait for apply API response before clicking Apply
    const applyResponsePromise = page.waitForResponse(
        (resp) =>
            resp.url().includes('/api/meroShare/companyShare/') &&
            resp.request().method() === 'POST'
    );

    await page.fill('#transactionPIN', ENV.transactionPin);
    await page.getByRole('button', { name: 'Apply' }).click();

    const applyResponse = await applyResponsePromise;
    expect(applyResponse.status()).toBe(201);
    console.log(`✅ Applied for: ${share.companyName}`);
}

// --- Tests ---
test.describe.serial('Mero Share Automation', () => {

    test('Apply Share', async ({ page }) => {
        await page.goto(`${BASE_URL}dashboard`);

        // Intercept the applicable shares API response
        const responsePromise = page.waitForResponse(
            (resp) =>
                resp.url().includes('/api/meroShare/companyShare/applicableIssue/') &&
                resp.request().method() === 'POST'
        );

        await page.getByRole('link', { name: 'My ASBA' }).click();
        await expect(page).toHaveURL(/asba/);

        const response = await responsePromise;
        const allShares = (await response.json()).object;

        // Filter only applicable IPO shares for general public
        const applicableShares = allShares.filter(
            (share) =>
                !share.action &&
                share.shareTypeName === 'IPO' &&
                share.shareGroupName === 'Ordinary Shares' &&
                share.subGroup === 'For General Public'
        );

        // console.log('Applicable shares:', JSON.stringify(applicableShares, null, 2));

        if (applicableShares.length === 0) {
            console.log('⚠️  No shares to apply.');
            return;
        }

        for (const share of applicableShares) {
            await applyForShare(page, share);
        }
    });

    test('Calculate Purchase Source', async ({ page }) => {
        await page.goto(`${BASE_URL}dashboard`);
        await page.getByRole('link', { name: 'My Purchase Source' }).click();
        await expect(page).toHaveURL(/purchase/);

        await page.locator('#script').click();

        // Get all available script options
        const scripts = await page.locator('#browsers option').evaluateAll(
            (nodes) => nodes.map((node) => node.value)
        );

        if (scripts.length === 0) {
            console.log('⚠️  No scripts available.');
            return;
        }

        for (const script of scripts) {
            // Select script and search
            await page.locator('#script').fill(script);
            await expect(page.locator('#script')).toHaveValue(script);
            await page.getByRole('button', { name: 'Search' }).click();

            // Verify script appears in results table
            const scriptInTable = page.locator('table tbody td').filter({ hasText: script.trim() }).first();
            await expect(scriptInTable).toBeVisible();

            // Select the row checkbox
            const row = page.locator('tbody.table__body tr.table__body-row').filter({
                has: page.locator('td', { hasText: script.trim() }),
            });
            await row.locator('input[type="checkbox"]').check();
            await expect(row.locator('input[type="checkbox"]')).toBeChecked();

            // Proceed and confirm
            await page.getByRole('button', { name: 'Proceed' }).click();
            await page.locator('input.disclaimer').check();
            await expect(page.locator('input.disclaimer')).toBeChecked();
            await page.getByRole('button', { name: 'Update' }).click();

            console.log(`✅ Purchase source calculated for: ${script}`);
        }
    });
});
