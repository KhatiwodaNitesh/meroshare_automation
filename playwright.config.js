// @ts-check
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const runId = process.env.MS_RUN_ID?.trim();
const reportOutputFolder = runId
    ? path.resolve(__dirname, 'playwright-report', runId)
    : path.resolve(__dirname, 'playwright-report');
const testResultsOutputDir = runId
    ? path.resolve(__dirname, 'test-results', runId)
    : path.resolve(__dirname, 'test-results');

export default defineConfig({
    testDir: './tests',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 90 * 1000,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        [
            'html',
            {
                open: process.env.CI ? 'never' : 'on-failure',
                outputFolder: reportOutputFolder,
            },
        ],
    ],
    outputDir: testResultsOutputDir,
    use: {
        baseURL: process.env.URL,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'setup',
            testMatch: /auth\.setup\.js/,
        },
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            dependencies: ['setup'],
        },
    ],
});
