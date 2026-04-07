import { test as setup } from '@playwright/test';
import { loginAndPersistSession } from './flows/auth';

setup('authenticate', async ({ page }) => {
    await loginAndPersistSession(page);
});
