"use strict";
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersistentSnapshotter = void 0;
const events_1 = require("events");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const util_1 = __importDefault(require("util"));
const snapshotter_1 = require("./snapshotter");
const fsWriteFileAsync = util_1.default.promisify(fs_1.default.writeFile.bind(fs_1.default));
const fsAppendFileAsync = util_1.default.promisify(fs_1.default.appendFile.bind(fs_1.default));
const fsMkdirAsync = util_1.default.promisify(fs_1.default.mkdir.bind(fs_1.default));
const kSnapshotInterval = 100;
class PersistentSnapshotter extends events_1.EventEmitter {
    constructor(context, tracePrefix, resourcesDir) {
        super();
        this._writeArtifactChain = Promise.resolve();
        this._resourcesDir = resourcesDir;
        this._networkTrace = tracePrefix + '-network.trace';
        this._snapshotTrace = tracePrefix + '-dom.trace';
        this._snapshotter = new snapshotter_1.Snapshotter(context, this);
    }
    async start() {
        await fsMkdirAsync(this._resourcesDir, { recursive: true }).catch(() => { });
        await fsAppendFileAsync(this._networkTrace, Buffer.from([]));
        await fsAppendFileAsync(this._snapshotTrace, Buffer.from([]));
        await this._snapshotter.initialize();
        await this._snapshotter.setAutoSnapshotInterval(kSnapshotInterval);
    }
    async dispose() {
        this._snapshotter.dispose();
        await this._writeArtifactChain;
    }
    captureSnapshot(page, snapshotName, element) {
        this._snapshotter.captureSnapshot(page, snapshotName, element);
    }
    onBlob(blob) {
        this._writeArtifactChain = this._writeArtifactChain.then(async () => {
            await fsWriteFileAsync(path_1.default.join(this._resourcesDir, blob.sha1), blob.buffer).catch(() => { });
        });
    }
    onResourceSnapshot(resource) {
        this._writeArtifactChain = this._writeArtifactChain.then(async () => {
            await fsAppendFileAsync(this._networkTrace, JSON.stringify(resource) + '\n');
        });
    }
    onFrameSnapshot(snapshot) {
        this._writeArtifactChain = this._writeArtifactChain.then(async () => {
            await fsAppendFileAsync(this._snapshotTrace, JSON.stringify(snapshot) + '\n');
        });
    }
}
exports.PersistentSnapshotter = PersistentSnapshotter;
//# sourceMappingURL=persistentSnapshotter.js.map