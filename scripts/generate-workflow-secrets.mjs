#!/usr/bin/env node
/**
 * Helper script to generate YAML entries for exporting more AUTOMATION_USER_N secrets in GitHub Actions
 * Usage: node scripts/generate-workflow-secrets.mjs --start 21 --count 30
 * This generates workflow env lines for users 21-50
 */

import process from 'process';

function parseArgs() {
    const args = process.argv.slice(2);
    let start = 1;
    let count = 10;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--start' && args[i + 1]) {
            start = parseInt(args[i + 1], 10);
            i++;
        }
        if (args[i] === '--count' && args[i + 1]) {
            count = parseInt(args[i + 1], 10);
            i++;
        }
    }

    if (!Number.isInteger(start) || start < 1) {
        throw new Error(`Invalid --start value: ${start}`);
    }

    if (!Number.isInteger(count) || count < 1) {
        throw new Error(`Invalid --count value: ${count}`);
    }

    return { start, count };
}

function generateSecrets(start, count) {
    const lines = [];
    for (let i = start; i < start + count; i++) {
        lines.push(`          AUTOMATION_USER_${i}: \${{ secrets.AUTOMATION_USER_${i} || '' }}`);
    }
    return lines;
}

const { start, count } = parseArgs();
const secrets = generateSecrets(start, count);

console.log('Add these lines to .github/workflows/daily.yml in the "env:" section:\n');
console.log(secrets.join('\n'));
console.log(`\nGenerated ${count} secrets from AUTOMATION_USER_${start} to AUTOMATION_USER_${start + count - 1}`);
console.log('\nThen set the matching repository secrets with JSON configuration. The workflow already provides the default URL.');
