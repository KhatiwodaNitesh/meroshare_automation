import { expect } from '@playwright/test';

async function readOptions(selectLocator) {
    return selectLocator.locator('option').evaluateAll((nodes) =>
        nodes
            .map((node) => ({
                value: node.value,
                label: node.textContent?.trim() ?? '',
            }))
            .filter((option) => option.value && option.label)
    );
}

export async function waitForSelectOptions(selectLocator, message, timeout = 30000) {
    await expect(selectLocator).toBeVisible();
    await expect.poll(
        async () => readOptions(selectLocator),
        {
            message,
            timeout,
        }
    ).not.toHaveLength(0);

    return readOptions(selectLocator);
}

export async function selectOptionByLabel(selectLocator, matcher, message) {
    const options = await waitForSelectOptions(selectLocator, message);
    const matchedOption = options.find((option) => matcher(option));

    if (!matchedOption) {
        return { options, matchedOption: null };
    }

    await selectLocator.selectOption(matchedOption.value);
    await expect(selectLocator).toHaveValue(matchedOption.value);
    return { options, matchedOption };
}

export async function selectFirstOption(selectLocator, message) {
    const options = await waitForSelectOptions(selectLocator, message);
    const selectedOption = options[0] ?? null;

    if (!selectedOption) {
        return { options, selectedOption: null };
    }

    await selectLocator.selectOption(selectedOption.value);
    await expect(selectLocator).toHaveValue(selectedOption.value);
    return { options, selectedOption };
}
