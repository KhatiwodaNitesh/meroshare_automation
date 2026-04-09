import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const REQUIRED_USER_FIELDS = [
    'dpName',
    'username',
    'password',
    'bankName',
    'crn',
    'kitta',
    'transactionPin',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const DEFAULT_NPM_SCRIPT = 'test:ci';

dotenv.config({ path: path.resolve(projectRoot, '.env') });

function fail(message) {
    throw new Error(message);
}

function parseCliArgs() {
    const args = process.argv.slice(2);
    let npmScript = DEFAULT_NPM_SCRIPT;

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];

        if (arg === '--script') {
            const value = args[index + 1]?.trim();
            if (!value) {
                fail('Missing value for --script.');
            }

            npmScript = value;
            index += 1;
            continue;
        }

        fail(`Unknown argument: ${arg}`);
    }

    return { npmScript };
}

function requireEnv(name) {
    const value = getEnv(name);
    if (!value) {
        fail(`Missing required environment variable: ${name}`);
    }
    return value;
}

function getEnv(name) {
    return process.env[name]?.trim() || null;
}

function deriveUserId(secretName) {
    // Extract number from AUTOMATION_USER_N pattern
    const match = secretName.match(/\d+/);
    if (match) {
        return `user-${match[0]}`;
    }
    return secretName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function discoverUserSecrets() {
    // Find all environment variables matching pattern: AUTOMATION_USER_* that have values
    const userSecretNames = Object.keys(process.env)
        .filter((key) => /^AUTOMATION_USER_\d+$/.test(key) && process.env[key]?.trim())
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0], 10);
            const numB = parseInt(b.match(/\d+/)[0], 10);
            return numA - numB;
        });

    console.log(`\n📋 Discovered user configurations: ${userSecretNames.length > 0 ? userSecretNames.length : 'none'}\n`);

    return userSecretNames;
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
    const userSecretNames = discoverUserSecrets();

    if (userSecretNames.length === 0) {
        fail('No user configurations found. Define at least one secret with pattern AUTOMATION_USER_N (e.g., AUTOMATION_USER_1, AUTOMATION_USER_2)');
    }

    const users = [];
    for (const secretName of userSecretNames) {
        const rawValue = getEnv(secretName);
        if (rawValue) {
            users.push(parseUserSecret(secretName, rawValue));
        }
    }

    if (users.length === 0) {
        fail('No user configurations have values. Ensure at least one secret is configured.');
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
        fail(
            `Requested user_ids not found in configured secrets: ${missingIds.join(', ')}. Available ids: ${allUsers.map((user) => user.id).join(', ')}`
        );
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

function runForUser(user, npmScript) {
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

        const child = spawn(npmCommand, ['run', npmScript], {
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
    const { npmScript } = parseCliArgs();
    requireEnv('URL');
    const allUsers = validateUsers(readUsersFromSecrets());
    const requestedUserIds = parseRequestedUserIds();
    const selectedUsers = selectUsers(allUsers, requestedUserIds);

    if (selectedUsers.length === 0) {
        fail('No users selected for execution.');
    }

    console.log(
        `✅ Running ${npmScript} for ${selectedUsers.length} user(s): ${selectedUsers.map((user) => `\`${user.id}\``).join(', ')}\n`
    );

    const results = [];
    for (const user of selectedUsers) {
        console.log(`\n🚀 Starting run for ${user.id}...`);
        clearRunArtifacts(user.id);
        const result = await runForUser(user, npmScript);
        results.push(result);
        console.log(`✅ Finished run for ${user.id}: ${renderStatus(result)}`);
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
