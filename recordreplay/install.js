const fs = require("fs");
const https = require("https");
const { spawnSync } = require("child_process");

const INSTALLATION_CONFIGURATIONS = {
  "darwin:firefox": ["macOS-replay-playwright.tar.xz", "firefox", "firefox"],
  "linux:firefox": ["linux-replay-playwright.tar.xz", "firefox", "firefox"],
  "linux:chromium": [
    "linux-replay-chromium.tar.xz",
    "replay-chromium",
    "chrome-linux",
  ],
  "linux:chrome": [
    "linux-replay-chromium.tar.xz",
    "replay-chromium",
    "chrome-linux",
  ],
};

// Install replay enabled browsers.
function installAll() {
  if (!process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) {
    (async () => await replayInstall())();
  }
}

async function install(browserName) {
  if (!browserName) {
    throw new Error("No browser specified");
  }

  const args =
    INSTALLATION_CONFIGURATIONS[`${process.platform}:${browserName}`];
  if (!args) {
    throw new Error(
      `Replay is not supported for ${browserName} on ${process.platform}`
    );
  }

  await installReplayBrowser(...args);
}

async function installAll() {
  console.log("Installing Replay browsers...");
  try {
    switch (process.platform) {
      case "darwin":
        await install("firefox");
        break;
      case "linux":
        await install("firefox");
        await install("chromium");
        break;
    }
  } catch (e) {
    console.error("Failed to install Replay browsers");
    console.error(e);
  }
  console.log("Done.");
}

async function installReplayBrowser(name, srcName, dstName) {
  console.log(`Installing Replay for ${srcName}`);

  const replayDir =
    process.env.RECORD_REPLAY_DIRECTORY || `${process.env.HOME}/.replay`;
  if (fs.existsSync(`${replayDir}/playwright/${dstName}`)) {
    return;
  }

  const contents = await downloadReplayFile(name);

  for (const dir of [replayDir, `${replayDir}/playwright`]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
  }
  fs.writeFileSync(`${replayDir}/playwright/${name}`, contents);
  spawnSync("tar", ["xf", name], { cwd: `${replayDir}/playwright` });
  fs.unlinkSync(`${replayDir}/playwright/${name}`);

  if (srcName != dstName) {
    fs.renameSync(
      `${replayDir}/playwright/${srcName}`,
      `${replayDir}/playwright/${dstName}`
    );
  }
}

async function downloadReplayFile(downloadFile) {
  console.log(`Downloading ${downloadFile}`);

  const options = {
    host: "static.replay.io",
    port: 443,
    path: `/downloads/${downloadFile}`,
  };

  for (let i = 0; i < 5; i++) {
    const waiter = defer();
    const request = https.get(options, (response) => {
      if (response.statusCode != 200) {
        console.log(
          `Download received status code ${response.statusCode}, retrying...`
        );
        request.destroy();
        waiter.resolve(null);
        return;
      }
      const buffers = [];
      response.on("data", (data) => buffers.push(data));
      response.on("end", () => waiter.resolve(buffers));
    });
    request.on("error", (err) => {
      console.log(`Download error ${err}, retrying...`);
      request.destroy();
      waiter.resolve(null);
    });
    const buffers = await waiter.promise;
    if (buffers) {
      console.log("Download complete");
      return Buffer.concat(buffers);
    }
  }

  throw new Error("Download failed, giving up");
}

function defer() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

module.exports = {
  install,
  installAll,
};
