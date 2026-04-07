import { test, expect } from '@playwright/test';
import { attachCiArtifacts, attachCiPageDebug } from './support/ci-debug';
import { appRoute } from './support/config';
import { injectSession, readSession } from './support/session';
import {
    applyForShare,
    filterApplicableIpoShares,
    getApplicableShares,
} from './flows/asba';
import {
    getPurchaseSourceScripts,
    updatePurchaseSourceForScript,
} from './flows/purchase-source';

// --- Session Setup ---
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

// --- Tests ---
test.describe.serial('Mero Share Automation', () => {

    test('Apply Share', async ({ page }) => {
        test.setTimeout(process.env.CI ? 120000 : 90000);
        const allShares = await getApplicableShares(page);
        const applicableShares = filterApplicableIpoShares(allShares);

        if (applicableShares.length === 0) {
            console.log('No shares to apply.');
            return;
        }

        for (const share of applicableShares) {
            await applyForShare(page, share);
        }
    });

    test('Calculate Purchase Source', async ({ page }) => {
        const scripts = await getPurchaseSourceScripts(page);

        if (scripts.length === 0) {
            console.log('No scripts available.');
            return;
        }

        for (const script of scripts) {
            await updatePurchaseSourceForScript(page, script);
        }
    });
});
