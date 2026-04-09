import { test, expect } from '@playwright/test';
import { getApplicableShares } from './flows/asba';
import { getPurchaseSourceScripts } from './flows/purchase-source';
import { attachCiArtifacts, attachCiPageDebug } from './support/ci-debug';
import { appRoute } from './support/config';
import { injectSession, readSession } from './support/session';

test.beforeEach(async ({ page }) => {
    attachCiPageDebug(page);
    const session = readSession();
    await injectSession(page, session);
    await page.goto(appRoute(), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /my asba/i })).toBeVisible({ timeout: 30000 });
});

test.afterEach(async ({ page }, testInfo) => {
    await attachCiArtifacts(page, testInfo);
});

test.describe.serial('Mero Share Smoke', () => {
    test('Dashboard loads for authenticated user', async ({ page }) => {
        await expect(page.getByRole('link', { name: /my purchase source/i })).toBeVisible({
            timeout: 30000,
        });
    });

    test('ASBA page loads without applying for shares', async ({ page }) => {
        const shares = await getApplicableShares(page);
        expect(Array.isArray(shares)).toBe(true);
        console.log(`Smoke check: loaded ${shares.length} ASBA share record(s).`);
    });

    test('Purchase source page loads without updating data', async ({ page }) => {
        const scripts = await getPurchaseSourceScripts(page);
        expect(Array.isArray(scripts)).toBe(true);
        console.log(`Smoke check: loaded ${scripts.length} purchase source script option(s).`);
    });
});
