# playwright

[Replay](https://replay.io) enabled fork of the [Playwright](https://playwright.dev) library.

## Overview

This is an alternative to Playwright that uses replay enabled browsers where possible, simplifying installation and versioning when compared with configuring the standard Playwright library to use replay browsers directly.

## Installation

`npm i @recordreplay/playwright`

## Usage

Replace `playwright` with `@recordreplay/playwright` in require/import statements, and this library will be used instead.  On supported platforms (see below), replay enabled browsers will be used to make recordings and save them to disk.  After running any playwright scripts, use the [replay-recordings](https://www.npmjs.com/package/@recordreplay/recordings-cli) CLI tool to manage and upload the recordings.

## Supported Platforms

The currently supported platforms/browsers are below.  On other platforms/browsers, the regular non-recording version of the browser will be used.

* macOS: firefox
* linux: firefox, chromium
