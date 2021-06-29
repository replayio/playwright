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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tracer = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const util = __importStar(require("util"));
const utils_1 = require("../../../utils/utils");
const browserContext_1 = require("../../browserContext");
const frames_1 = require("../../frames");
const helper_1 = require("../../helper");
const page_1 = require("../../page");
const persistentSnapshotter_1 = require("../../snapshot/persistentSnapshotter");
const fsAppendFileAsync = util.promisify(fs_1.default.appendFile.bind(fs_1.default));
const envTrace = utils_1.getFromENV('PWTRACE_RESOURCE_DIR');
class Tracer {
    constructor() {
        this._contextTracers = new Map();
    }
    async onContextCreated(context) {
        const traceDir = context._options._traceDir;
        if (!traceDir)
            return;
        const resourcesDir = envTrace || path_1.default.join(traceDir, 'resources');
        const tracePath = path_1.default.join(traceDir, utils_1.createGuid());
        const contextTracer = new ContextTracer(context, resourcesDir, tracePath);
        await contextTracer.start();
        this._contextTracers.set(context, contextTracer);
    }
    async onContextDidDestroy(context) {
        const contextTracer = this._contextTracers.get(context);
        if (contextTracer) {
            await contextTracer.dispose().catch(e => { });
            this._contextTracers.delete(context);
        }
    }
    async onBeforeInputAction(sdkObject, metadata, element) {
        var _a;
        (_a = this._contextTracers.get(sdkObject.attribution.context)) === null || _a === void 0 ? void 0 : _a._captureSnapshot('action', sdkObject, metadata, element);
    }
    async onBeforeCall(sdkObject, metadata, element) {
        var _a;
        (_a = this._contextTracers.get(sdkObject.attribution.context)) === null || _a === void 0 ? void 0 : _a._captureSnapshot('before', sdkObject, metadata, element);
    }
    async onAfterCall(sdkObject, metadata) {
        var _a, _b;
        (_a = this._contextTracers.get(sdkObject.attribution.context)) === null || _a === void 0 ? void 0 : _a._captureSnapshot('after', sdkObject, metadata);
        (_b = this._contextTracers.get(sdkObject.attribution.context)) === null || _b === void 0 ? void 0 : _b.onAfterCall(sdkObject, metadata);
    }
}
exports.Tracer = Tracer;
const snapshotsSymbol = Symbol('snapshots');
// This is an official way to pass snapshots between onBefore/AfterInputAction and onAfterCall.
function snapshotsForMetadata(metadata) {
    if (!metadata[snapshotsSymbol])
        metadata[snapshotsSymbol] = [];
    return metadata[snapshotsSymbol];
}
class ContextTracer {
    constructor(context, resourcesDir, tracePrefix) {
        this._disposed = false;
        const traceFile = tracePrefix + '-actions.trace';
        this._contextId = 'context@' + utils_1.createGuid();
        this._appendEventChain = utils_1.mkdirIfNeeded(traceFile).then(() => traceFile);
        const event = {
            timestamp: utils_1.monotonicTime(),
            type: 'context-created',
            browserName: context._browser.options.name,
            contextId: this._contextId,
            isMobile: !!context._options.isMobile,
            deviceScaleFactor: context._options.deviceScaleFactor || 1,
            viewportSize: context._options.viewport || undefined,
            debugName: context._options._debugName,
        };
        this._appendTraceEvent(event);
        this._snapshotter = new persistentSnapshotter_1.PersistentSnapshotter(context, tracePrefix, resourcesDir);
        this._eventListeners = [
            helper_1.helper.addEventListener(context, browserContext_1.BrowserContext.Events.Page, this._onPage.bind(this)),
        ];
    }
    async start() {
        await this._snapshotter.start();
    }
    async _captureSnapshot(name, sdkObject, metadata, element) {
        if (!sdkObject.attribution.page)
            return;
        const snapshotName = `${name}@${metadata.id}`;
        snapshotsForMetadata(metadata).push({ title: name, snapshotName });
        this._snapshotter.captureSnapshot(sdkObject.attribution.page, snapshotName, element);
    }
    async onAfterCall(sdkObject, metadata) {
        if (!sdkObject.attribution.page)
            return;
        const event = {
            timestamp: utils_1.monotonicTime(),
            type: 'action',
            contextId: this._contextId,
            metadata,
            snapshots: snapshotsForMetadata(metadata),
        };
        this._appendTraceEvent(event);
    }
    _onPage(page) {
        const pageId = page.uniqueId;
        const event = {
            timestamp: utils_1.monotonicTime(),
            type: 'page-created',
            contextId: this._contextId,
            pageId,
        };
        this._appendTraceEvent(event);
        page.on(page_1.Page.Events.Dialog, (dialog) => {
            if (this._disposed)
                return;
            const event = {
                timestamp: utils_1.monotonicTime(),
                type: 'dialog-opened',
                contextId: this._contextId,
                pageId,
                dialogType: dialog.type(),
                message: dialog.message(),
            };
            this._appendTraceEvent(event);
        });
        page.on(page_1.Page.Events.InternalDialogClosed, (dialog) => {
            if (this._disposed)
                return;
            const event = {
                timestamp: utils_1.monotonicTime(),
                type: 'dialog-closed',
                contextId: this._contextId,
                pageId,
                dialogType: dialog.type(),
            };
            this._appendTraceEvent(event);
        });
        page.mainFrame().on(frames_1.Frame.Events.Navigation, (navigationEvent) => {
            if (this._disposed || page.mainFrame().url() === 'about:blank')
                return;
            const event = {
                timestamp: utils_1.monotonicTime(),
                type: 'navigation',
                contextId: this._contextId,
                pageId,
                url: navigationEvent.url,
                sameDocument: !navigationEvent.newDocument,
            };
            this._appendTraceEvent(event);
        });
        page.on(page_1.Page.Events.Load, () => {
            if (this._disposed || page.mainFrame().url() === 'about:blank')
                return;
            const event = {
                timestamp: utils_1.monotonicTime(),
                type: 'load',
                contextId: this._contextId,
                pageId,
            };
            this._appendTraceEvent(event);
        });
        page.once(page_1.Page.Events.Close, () => {
            if (this._disposed)
                return;
            const event = {
                timestamp: utils_1.monotonicTime(),
                type: 'page-destroyed',
                contextId: this._contextId,
                pageId,
            };
            this._appendTraceEvent(event);
        });
    }
    async dispose() {
        this._disposed = true;
        helper_1.helper.removeEventListeners(this._eventListeners);
        await this._snapshotter.dispose();
        const event = {
            timestamp: utils_1.monotonicTime(),
            type: 'context-destroyed',
            contextId: this._contextId,
        };
        this._appendTraceEvent(event);
        // Ensure all writes are finished.
        await this._appendEventChain;
    }
    _appendTraceEvent(event) {
        // Serialize all writes to the trace file.
        this._appendEventChain = this._appendEventChain.then(async (traceFile) => {
            await fsAppendFileAsync(traceFile, JSON.stringify(event) + '\n');
            return traceFile;
        });
    }
}
//# sourceMappingURL=tracer.js.map