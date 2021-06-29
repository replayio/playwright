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
exports.PersistentSnapshotStorage = exports.BaseSnapshotStorage = void 0;
const events_1 = require("events");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const util_1 = __importDefault(require("util"));
const snapshotRenderer_1 = require("./snapshotRenderer");
class BaseSnapshotStorage extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this._resources = [];
        this._resourceMap = new Map();
        this._frameSnapshots = new Map();
        this._contextResources = new Map();
    }
    addResource(resource) {
        this._resourceMap.set(resource.resourceId, resource);
        this._resources.push(resource);
        let resources = this._contextResources.get(resource.url);
        if (!resources) {
            resources = [];
            this._contextResources.set(resource.url, resources);
        }
        resources.push({ frameId: resource.frameId, resourceId: resource.resourceId });
    }
    addFrameSnapshot(snapshot) {
        let frameSnapshots = this._frameSnapshots.get(snapshot.frameId);
        if (!frameSnapshots) {
            frameSnapshots = {
                raw: [],
                renderer: [],
            };
            this._frameSnapshots.set(snapshot.frameId, frameSnapshots);
        }
        frameSnapshots.raw.push(snapshot);
        const renderer = new snapshotRenderer_1.SnapshotRenderer(new Map(this._contextResources), frameSnapshots.raw, frameSnapshots.raw.length - 1);
        frameSnapshots.renderer.push(renderer);
        this.emit('snapshot', renderer);
    }
    resourceById(resourceId) {
        return this._resourceMap.get(resourceId);
    }
    resources() {
        return this._resources.slice();
    }
    snapshotByName(frameId, snapshotName) {
        var _a;
        return (_a = this._frameSnapshots.get(frameId)) === null || _a === void 0 ? void 0 : _a.renderer.find(r => r.snapshotName === snapshotName);
    }
    snapshotByTime(frameId, timestamp) {
        var _a;
        let result = undefined;
        for (const snapshot of ((_a = this._frameSnapshots.get(frameId)) === null || _a === void 0 ? void 0 : _a.renderer.values()) || []) {
            if (timestamp && snapshot.snapshot().timestamp <= timestamp)
                result = snapshot;
        }
        return result;
    }
}
exports.BaseSnapshotStorage = BaseSnapshotStorage;
const fsReadFileAsync = util_1.default.promisify(fs_1.default.readFile.bind(fs_1.default));
class PersistentSnapshotStorage extends BaseSnapshotStorage {
    async load(tracePrefix, resourcesDir) {
        this._resourcesDir = resourcesDir;
        const networkTrace = await fsReadFileAsync(tracePrefix + '-network.trace', 'utf8');
        const resources = networkTrace.split('\n').map(line => line.trim()).filter(line => !!line).map(line => JSON.parse(line));
        resources.forEach(r => this.addResource(r));
        const snapshotTrace = await fsReadFileAsync(path_1.default.join(tracePrefix + '-dom.trace'), 'utf8');
        const snapshots = snapshotTrace.split('\n').map(line => line.trim()).filter(line => !!line).map(line => JSON.parse(line));
        snapshots.forEach(s => this.addFrameSnapshot(s));
    }
    resourceContent(sha1) {
        return fs_1.default.readFileSync(path_1.default.join(this._resourcesDir, sha1));
    }
}
exports.PersistentSnapshotStorage = PersistentSnapshotStorage;
//# sourceMappingURL=snapshotStorage.js.map