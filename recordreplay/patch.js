const path = require("path");
const { Registry } = require("../lib/utils/registry");
const { install } = require("./install");

const EXECUTABLE_PATHS = {
  "darwin:firefox": ["firefox", "Nightly.app", "Contents", "MacOS", "firefox"],
  "linux:chromium": ["chrome-linux", "chrome"],
  "linux:firefox": ["firefox", "firefox"],
};

function getExecutableEntry(name) {
  let browserRoot;
    // Override with replay specific browsers.
    const replayDir =
    process.env.RECORD_REPLAY_DIRECTORY ||
    path.join(process.env.HOME, ".replay");
  const key = `${process.platform}:${name}`;
  switch (key) {
    case "darwin:firefox":
    case "linux:firefox":
    case "linux:chromium":
      browserRoot = path.join(replayDir, "playwright");
    default:
      break;
  }

  if (!browserRoot) {
    return;
  }

  return {
    type: "browser",
    name,
    browserName: name,
    directory: path.join(browserRoot, name),
    executablePath: () => path.join(browserRoot, ...EXECUTABLE_PATHS[key]),
    executablePathOrDie: () =>
      path.join(browserRoot, ...EXECUTABLE_PATHS[key]),
    installType: "download-by-default",
    validateHostRequirements: () => true,
    _install: () => install(name),
    _dependencyGroup: name,
  }
}

const {defaultExecutables, findExecutable} = Registry.prototype;
Registry.prototype.findExecutable = function(name) {
  const entry = getExecutableEntry(name);

  if (entry) {
    process.env.RECORD_ALL_CONTENT = "1";
    return entry;
  }

  return findExecutable.call(this, name);
};

Registry.prototype.defaultExecutables = function() {
  return [
    // placing the Replay entries first so they are preferred over the defaults
    getExecutableEntry("firefox"),
    getExecutableEntry("chrome"),
    ...defaultExecutables.call(this)
  ].filter(Boolean);
}
