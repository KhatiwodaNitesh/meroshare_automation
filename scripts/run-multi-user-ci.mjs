import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const REQUIRED_USER_FIELDS = [
    'dpName',
    'username',
    'password',
    'bankName',
    'crn',
    'kitta',
    'transactionPin',
];
const USER_SECRET_ENV_NAMES = [
    'BHAGAWOTI_ENV',
    'KHILA_ENV',
    'NABIN_ENV',
    'NISHA_ENV',
    'NITESH_ENV',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function fail(message) {
    throw new Error(message);
}

function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        fail(`Missing required environment variable: ${name}`);
    }
    return value;
}

function deriveUserId(secretName) {
    return secretName
        .replace(/_ENV$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-');
}

function parseUserSecret(secretName, rawValue) {
    let user;
    try {
        user = JSON.parse(rawValue);
    } catch (error) {
        fail(`Invalid ${secretName}: ${error.message}`);
    }

    if (!user || typeof user !== 'object' || Array.isArray(user)) {
        fail(`Invalid ${secretName}: expected a JSON object.`);
    }

    const normalizedUser = {
        ...user,
        id:
            typeof user.id === 'string' && user.id.trim()
                ? user.id.trim()
                : deriveUserId(secretName),
    };

    return normalizedUser;
}

function readUsersFromSecrets() {
    const users = [];

    for (const secretName of USER_SECRET_ENV_NAMES) {
        const rawValue = process.env[secretName]?.trim();
        if (!rawValue) continue;

        users.push(parseUserSecret(secretName, rawValue));
    }

    if (users.length === 0) {
        fail(
            `No user secrets configured. Set at least one of: ${USER_SECRET_ENV_NAMES.join(', ')}`
        );
    }

    return users;
}

function validateUser(user, index) {
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
        fail(`Invalid user config at index ${index}: expected an object.`);
    }

    for (const fieldName of REQUIRED_USER_FIELDS) {
        if (typeof user[fieldName] !== 'string' || !user[fieldName].trim()) {
            fail(`Invalid user at index ${index}: missing required field "${fieldName}".`);
        }
    }

    if (typeof user.id !== 'string' || !user.id.trim()) {
        fail(`Invalid user at index ${index}: missing required field "id".`);
    }

    if (!/^[A-Za-z0-9._-]+$/.test(user.id.trim())) {
        fail(
            `Invalid user id "${user.id}": use only letters, numbers, ".", "_" or "-".`
        );
    }

    return Object.fromEntries(
        Object.entries(user).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    );
}

function validateUsers(users) {
    const validatedUsers = users.map(validateUser);
    const seenIds = new Set();

    for (const user of validatedUsers) {
        if (seenIds.has(user.id)) {
            fail(`Duplicate user id in configured secrets: ${user.id}`);
        }
        seenIds.add(user.id);
    }

    return validatedUsers;
}

function parseRequestedUserIds() {
    const rawValue = process.env.USER_IDS?.trim();
    if (!rawValue) return [];

    return [...new Set(rawValue.split(',').map((id) => id.trim()).filter(Boolean))];
}

function selectUsers(allUsers, requestedUserIds) {
    if (requestedUserIds.length === 0) return allUsers;

    const allUserIds = new Set(allUsers.map((user) => user.id));
    const missingIds = requestedUserIds.filter((id) => !allUserIds.has(id));

    if (missingIds.length > 0) {
        fail(`Requested user_ids not found in configured secrets: ${missingIds.join(', ')}`);
    }

    return allUsers.filter((user) => requestedUserIds.includes(user.id));
}

function removePathIfExists(targetPath) {
    fs.rmSync(targetPath, { recursive: true, force: true });
}

function clearRunArtifacts(runId) {
    removePathIfExists(path.join(projectRoot, 'playwright', '.auth', runId));
    removePathIfExists(path.join(projectRoot, 'playwright-report', runId));
    removePathIfExists(path.join(projectRoot, 'test-results', runId));
}

function renderStatus(result) {
    return result.exitCode === 0 ? 'passed' : 'failed';
}

function formatDuration(durationMs) {
    return `${Math.round(durationMs / 1000)}s`;
}

function formatExit(result) {
    return result.exitCode === null ? `signal:${result.signal ?? 'unknown'}` : String(result.exitCode);
}

function appendStepSummary(lines) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) return;
    fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

function writeStepSummary(results, selectedUsers) {
    appendStepSummary([
        '## MeroShare Multi-User Run',
        '',
        `Selected users: ${selectedUsers.map((user) => `\`${user.id}\``).join(', ')}`,
        '',
        '| User | Status | Exit | Duration |',
        '| --- | --- | --- | --- |',
        ...results.map(
            (result) =>
                `| \`${result.id}\` | ${renderStatus(result)} | ${formatExit(result)} | ${formatDuration(result.durationMs)} |`
        ),
        '',
    ]);
}

function logSummary(results) {
    console.log('\n=== Multi-user run summary ===');
    for (const result of results) {
        console.log(
            `- ${result.id}: ${renderStatus(result)} (exit=${formatExit(result)}, duration=${formatDuration(result.durationMs)})`
        );
    }
}

function runForUser(user) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const childEnv = {
            ...process.env,
            MS_USER_JSON: JSON.stringify(user),
            MS_RUN_ID: user.id,
        };

        delete childEnv.DP_NAME;
        delete childEnv.MS_USERNAME;
        delete childEnv.MS_PASSWORD;
        delete childEnv.DMAT_BANK_NAME;
        delete childEnv.CRN_NO;
        delete childEnv.KITTA_NO;
        delete childEnv.TRANS_PIN;

        const child = spawn(npmCommand, ['run', 'test:ci'], {
            cwd: projectRoot,
            env: childEnv,
            stdio: 'inherit',
        });

        child.on('error', reject);
        child.on('close', (exitCode, signal) => {
            resolve({
                id: user.id,
                durationMs: Date.now() - startedAt,
                exitCode: signal ? null : exitCode ?? 1,
                signal,
            });
        });
    });
}

async function main() {
    requireEnv('URL');

    const allUsers = validateUsers(readUsersFromSecrets());
    const requestedUserIds = parseRequestedUserIds();
    const selectedUsers = selectUsers(allUsers, requestedUserIds);

    if (selectedUsers.length === 0) {
        fail('No users selected for execution.');
    }

    console.log(`Running MeroShare automation for users: ${selectedUsers.map((user) => user.id).join(', ')}`);

    const results = [];
    for (const user of selectedUsers) {
        console.log(`\n=== Starting run for ${user.id} ===`);
        clearRunArtifacts(user.id);
        const result = await runForUser(user);
        results.push(result);
        console.log(`=== Finished run for ${user.id}: ${renderStatus(result)} ===`);
    }

    logSummary(results);
    writeStepSummary(results, selectedUsers);

    if (results.some((result) => result.exitCode !== 0)) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(`Multi-user CI runner failed: ${error.message}`);
    appendStepSummary([
        '## MeroShare Multi-User Run',
        '',
        `Failed before execution: ${error.message}`,
        '',
    ]);
    process.exitCode = 1;
});
