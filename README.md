# playwright

A [Replay](https://replay.io)-enabled fork of the [Playwright](https://playwright.dev) library.

## Overview

This is an alternative to Playwright that uses Replay-enabled browsers where possible to create replays of test runs.

## Installation

`npm i @recordreplay/playwright`

**In addition to this package, you'll also need to install:**

1. [`@recordreplay/replay-recordings`](https://github.com/RecordReplay/recordings-cli) to manage and upload replays.
2. [`@recordreplay/playwright-config`](https://github.com/RecordReplay/playwright-config) to configure Playwright to use the Replay-enabled browsers.


## Usage

### With `@playwright/test`

You can use the Replay browser as drop-in replacement for your existing `@playwright/test` suite.

Update your `playwright.config.js` file to use the Replay version of your preferred browser with the `devices` object from `@recordreplay/playwright-config`.

**Chromium example (Linux only):**

```
// playwright.config.js
// @ts-check
const { devices } = require("@recordreplay/playwright-config");

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	use: {
		trace: "on-first-retry",
		defaultBrowserType: "chromium",
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Replay Chromium"],
			},
		},
	],
};

module.exports = config;
```

Run `npx playwright test` as usual to execute the tests and record with Replay.

#### Notes

- Replay will create a recording for each individual test.
- You will need to upload your recordings with the `replay-recordings` CLI.

For example, the following command will upload the last test recording to your Replay Library:

`RECORD_REPLAY_API_KEY=123 npx replay-recordings view-latest`

For other commands, see the [@recordreplay/replay-recordings](https://github.com/RecordReplay/recordings-cli) documentation.

### As a Node script

You can also write tests as a function that uses `playwright.[browser].launch()`. This can give you more control over which tests are recorded.

**Example:**

```
// firefox.spec.js

const playwright = require("playwright");
const { getExecutablePath } = require("@recordreplay/playwright-config");

(async () => {
	const browser = await playwright.firefox.launch({
		headless: false,
		executablePath: getExecutablePath("firefox"),
		env: {
			RECORD_ALL_CONTENT: 1,
		},
	});
	const page = await browser.newPage();
	await page.goto("https://replay.io");
	await page.screenshot({ path: "replay.png" });

	await page.close();
	await browser.close();
})();
```

You can then use `node firefox.spec.js` to execute and record your test. This will generate a single recording of all the test code in the file. Use [@recordreplay/replay-recordings](https://github.com/RecordReplay/recordings-cli) to manage and upload recordings.

You can still use `expect` from `@playwright/test` in your test code. Import the command directly like in the example below.

```
// firefox-expect.spec.js

const playwright = require("playwright");
const { expect } = require('@playwright/test');
const { getExecutablePath } = require("@recordreplay/playwright-config");

(async () => {
  const browser = await playwright.firefox.launch({
		headless: false,
		executablePath: getExecutablePath("firefox"),
		env: {
			RECORD_ALL_CONTENT: 1,
		},
	});
	const page = await browser.newPage();
	await page.goto('https://demo.playwright.dev/todomvc');
	
    const TODO_ITEMS = [
        'buy some cheese',
        'feed the cat'
      ];

    // Create 1st todo.
    await page.locator('.new-todo').click();
    await page.locator('.new-todo').fill(TODO_ITEMS[0]);
    await page.locator('.new-todo').press('Enter');

    // Create 2nd todo.
    await page.locator('.new-todo').fill(TODO_ITEMS[1]);
    await page.locator('.new-todo').press('Enter');

    // Assert todo content
    await expect(page.locator('.view label')).toHaveText([
      TODO_ITEMS[0],
      TODO_ITEMS[1]
    ]);

	await page.close();
	await browser.close();
})()
```

#### Upload failed recording automatically

Writing your tests as a Node script allows you to upload failed recordings automatically using `@recordreplay/recordings-cli` as a Node module.

For the example below, use `REPLAY_API_KEY=123 node upload-failure.spec.js` to execute and record the test.

```
//upload-failure.spec.js

const playwright = require("playwright");
const { expect } = require('@playwright/test');
const { getExecutablePath } = require("@recordreplay/playwright-config");
const replayCli = require("@recordreplay/recordings-cli");

async function test() {
	const browser = await playwright.firefox.launch({
		headless: false,
		executablePath: getExecutablePath("firefox"),
		env: {
			RECORD_ALL_CONTENT: 1,
		},
	});
	const page = await browser.newPage();
	await page.goto('https://demo.playwright.dev/todomvc');
	
    const TODO_ITEMS = [
        'buy some cheese',
        'feed the cat',
        'book a doctors appointment'
      ];

    // Create 1st todo.
    await page.locator('.new-todo').click();
    await page.locator('.new-todo').fill(TODO_ITEMS[0]);
    await page.locator('.new-todo').press('Enter');

    // Create 2nd todo.
    await page.locator('.new-todo').fill(TODO_ITEMS[1]);
    await page.locator('.new-todo').press('Enter');

    // This purposefully fails to trigger an upload
    await expect(page.locator('.view label')).toHaveText([
      TODO_ITEMS[1],
      TODO_ITEMS[2]
    ]);

	await page.close();
	await browser.close();
};

async function testRun() {
  try {
    await test()
  } catch (e) {
    const recordingId = await replayCli.viewLatestRecording({apiKey: `${process.env.REPLAY_API_KEY}`})
    console.log({e, recordingId})
    process.exit(1)
  }
}

testRun()

```

## Supported Platforms

The currently supported platforms/browsers are below.  On other platforms/browsers, the regular non-recording version of the browser will be used and a replay will not be created.

* macOS: firefox
* linux: firefox, chromium