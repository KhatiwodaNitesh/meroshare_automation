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
const IS_CI = !!process.env.CI;

function ciLog(message, payload) {
    if (!IS_CI) return;
    if (payload === undefined) {
        console.log(`[CI][DEBUG] ${message}`);
        return;
    }
    console.log(`[CI][DEBUG] ${message}: ${JSON.stringify(payload)}`);
}

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
    const bankSelect = page.locator('#selectBank');
    const bankName = ENV.bankName?.trim();

    if (!bankName) {
        throw new Error('DMAT_BANK_NAME is missing or empty in the environment.');
    }

    await expect(bankSelect).toBeVisible();
    await expect.poll(
        async () =>
            bankSelect.locator('option').evaluateAll((nodes) =>
                nodes
                    .map((node) => ({
                        value: node.value,
                        label: node.textContent?.trim() ?? '',
                    }))
                    .filter((option) => option.value && option.label)
            ),
        {
            message: 'Waiting for bank options to load',
            timeout: 30000,
        }
    ).not.toHaveLength(0);

    const options = await bankSelect.locator('option').evaluateAll((nodes) =>
        nodes.map((node) => ({
            value: node.value,
            label: node.textContent?.trim() ?? '',
        }))
    );

    const matchedOption = options.find((option) =>
        option.label.toLowerCase().includes(bankName.toLowerCase())
    );

    if (!matchedOption) {
        ciLog('Bank dropdown options', options.map((option) => option.label).filter(Boolean));
        throw new Error(`Bank not found in dropdown: ${bankName}`);
    }

    await bankSelect.selectOption(matchedOption.value);
    await expect(bankSelect).toHaveValue(matchedOption.value);
    ciLog('Selected bank', matchedOption.label);
}

// --- Helper: Select first available account from dropdown ---
async function selectAccount(page) {
    const accountSelect = page.locator('#accountNumber');
    await expect(accountSelect).toBeVisible();

    await expect.poll(
        async () =>
            accountSelect.locator('option').evaluateAll((nodes) =>
                nodes
                    .map((node) => ({
                        value: node.value,
                        label: node.textContent?.trim() ?? '',
                    }))
                    .filter((option) => option.value && option.label)
            ),
        {
            message: 'Waiting for account options to load',
            timeout: 30000,
        }
    ).not.toHaveLength(0);

    const options = await accountSelect.locator('option').evaluateAll((nodes) =>
        nodes
            .map((node) => ({
                value: node.value,
                label: node.textContent?.trim() ?? '',
            }))
            .filter((option) => option.value && option.label)
    );

    if (options.length === 0) {
        throw new Error('No account options available in account dropdown.');
    }

    const selectedAccount = options[0];
    await accountSelect.selectOption(selectedAccount.value);
    await expect(accountSelect).toHaveValue(selectedAccount.value);
    ciLog('Selected account', selectedAccount.label);
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

    await selectAccount(page);

    await page.fill('#appliedKitta', ENV.kitta);
    await expect(page.locator('#appliedKitta')).toHaveValue(ENV.kitta);

    await page.fill('#crnNumber', ENV.crn);

    await page.check('#disclaimer');
    await expect(page.locator('#disclaimer')).toBeChecked();

    await page.getByRole('button', { name: /proceed/i }).click();
    await expect(page.locator('#transactionPIN')).toBeVisible({ timeout: 30000 });

    await page.fill('#transactionPIN', ENV.transactionPin);
    const applyButton = page.getByRole('button', { name: 'Apply' });
    await expect(applyButton).toBeVisible({ timeout: 30000 });
    await expect(applyButton).toBeEnabled({ timeout: 30000 });

    const seenCompanySharePosts = [];
    const responseListener = (resp) => {
        if (resp.request().method() === 'POST' && resp.url().includes('/api/meroShare/companyShare/')) {
            seenCompanySharePosts.push({
                status: resp.status(),
                url: resp.url(),
            });
        }
    };

    page.on('response', responseListener);
    let applyResponse;
    try {
        [applyResponse] = await Promise.all([
            page.waitForResponse(
                (resp) =>
                    resp.request().method() === 'POST' &&
                    resp.url().includes('/api/meroShare/companyShare/') &&
                    !resp.url().includes('/applicableIssue/'),
                { timeout: 90000 }
            ),
            applyButton.click(),
        ]);
    } catch (error) {
        const alerts = await page
            .locator('[role="alert"], .toast-message, .error, .invalid-feedback, .mat-error')
            .allTextContents()
            .catch(() => []);
        ciLog('Apply request not observed', {
            companyName: share.companyName,
            applyButtonEnabled: await applyButton.isEnabled().catch(() => false),
            transactionPinLength: await page.locator('#transactionPIN').inputValue().then((v) => v.length).catch(() => 0),
            seenCompanySharePosts,
            alerts: alerts.map((t) => t.trim()).filter(Boolean).slice(0, 6),
        });
        throw error;
    } finally {
        page.off('response', responseListener);
    }

    expect(applyResponse.status()).toBe(201);
    console.log(`✅ Applied for: ${share.companyName}`);
}

// --- Tests ---
test.describe.serial('Mero Share Automation', () => {

    test('Apply Share', async ({ page }) => {
        test.setTimeout(process.env.CI ? 180000 : 60000);

        await page.goto(`${BASE_URL}dashboard`);

        await page.getByRole('link', { name: 'My ASBA' }).click();
        await expect(page).toHaveURL(/asba/);

        // Intercept the applicable shares API response
        const responsePromise = page.waitForResponse(
            (resp) =>
                resp.url().includes('/api/meroShare/companyShare/applicableIssue/') &&
                resp.request().method() === 'POST'
        );

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
