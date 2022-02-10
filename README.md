# playwright

[Replay](https://replay.io) enabled fork of the [Playwright](https://playwright.dev) library.

## Overview

This is an alternative to Playwright that uses replay enabled browsers where possible to create replays of test runs. It can be added to an existing Playwright test suite or be used as a standalone.

## Installation

`npm i @recordreplay/playwright`

## Usage

### With `playwright/test`

After installing, run `npx @recordreplay/playwright test` to execute the tests and record with Playwright. Only test runs in supported browsers (see below) will be recorded with Replay.

You will still use your existing `@playwright/test` imports for your test files and configuration.

### Standalone

Use `@recordreplay/playwright` in require/import statements and write your tests as a function that uses `playwright.[browser].launch()`. 

**Example:**

```
const playwright = require("playwright");

(async function () {
  const browser = await playwright.firefox.launch({
    headless: false,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://unsplash.com/");

  await page.close();
  await context.close();
  await browser.close();
})();
```

You can then use `node testfile.js` to execute and record your tests without needing to also install `@playwright/test`.

### Managing Replay recordings

Replays are saved locally to `~/.replay`. After running any playwright scripts, use the [replay-recordings](https://www.npmjs.com/package/@recordreplay/recordings-cli) CLI tool to manage and upload the recordings.

## Supported Platforms

The currently supported platforms/browsers are below.  On other platforms/browsers, the regular non-recording version of the browser will be used.

* macOS: firefox
* linux: firefox, chromium
