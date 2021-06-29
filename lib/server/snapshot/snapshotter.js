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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Snapshotter = void 0;
const browserContext_1 = require("../browserContext");
const page_1 = require("../page");
const helper_1 = require("../helper");
const debugLogger_1 = require("../../utils/debugLogger");
const snapshotterInjected_1 = require("./snapshotterInjected");
const utils_1 = require("../../utils/utils");
class Snapshotter {
    constructor(context, delegate) {
        this._eventListeners = [];
        this._interval = 0;
        this._context = context;
        this._delegate = delegate;
        for (const page of context.pages())
            this._onPage(page);
        this._eventListeners = [
            helper_1.helper.addEventListener(this._context, browserContext_1.BrowserContext.Events.Page, this._onPage.bind(this)),
        ];
    }
    async initialize() {
        await this._context.exposeBinding(snapshotterInjected_1.kSnapshotBinding, false, (source, data) => {
            const snapshot = {
                snapshotName: data.snapshotName,
                pageId: source.page.uniqueId,
                frameId: source.frame.uniqueId,
                frameUrl: data.url,
                doctype: data.doctype,
                html: data.html,
                viewport: data.viewport,
                timestamp: utils_1.monotonicTime(),
                pageTimestamp: data.timestamp,
                collectionTime: data.collectionTime,
                resourceOverrides: [],
            };
            for (const { url, content } of data.resourceOverrides) {
                if (typeof content === 'string') {
                    const buffer = Buffer.from(content);
                    const sha1 = utils_1.calculateSha1(buffer);
                    this._delegate.onBlob({ sha1, buffer });
                    snapshot.resourceOverrides.push({ url, sha1 });
                }
                else {
                    snapshot.resourceOverrides.push({ url, ref: content });
                }
            }
            this._delegate.onFrameSnapshot(snapshot);
        });
        const initScript = '(' + snapshotterInjected_1.frameSnapshotStreamer.toString() + ')()';
        await this._context._doAddInitScript(initScript);
        const frames = [];
        for (const page of this._context.pages())
            frames.push(...page.frames());
        frames.map(frame => {
            var _a;
            (_a = frame._existingMainContext()) === null || _a === void 0 ? void 0 : _a.rawEvaluate(initScript).catch(debugExceptionHandler);
        });
    }
    dispose() {
        helper_1.helper.removeEventListeners(this._eventListeners);
    }
    captureSnapshot(page, snapshotName, element) {
        // This needs to be sync, as in not awaiting for anything before we issue the command.
        const expression = `window[${JSON.stringify(snapshotterInjected_1.kSnapshotStreamer)}].captureSnapshot(${JSON.stringify(snapshotName)})`;
        element === null || element === void 0 ? void 0 : element.callFunctionNoReply((element, snapshotName) => {
            element.setAttribute('__playwright_target__', snapshotName);
        }, snapshotName);
        const snapshotFrame = (frame) => {
            const context = frame._existingMainContext();
            context === null || context === void 0 ? void 0 : context.rawEvaluate(expression).catch(debugExceptionHandler);
        };
        page.frames().map(frame => snapshotFrame(frame));
    }
    async setAutoSnapshotInterval(interval) {
        this._interval = interval;
        const frames = [];
        for (const page of this._context.pages())
            frames.push(...page.frames());
        await Promise.all(frames.map(frame => setIntervalInFrame(frame, interval)));
    }
    _onPage(page) {
        const processNewFrame = (frame) => {
            var _a;
            annotateFrameHierarchy(frame);
            setIntervalInFrame(frame, this._interval);
            // FIXME: make addInitScript work for pages w/ setContent.
            const initScript = '(' + snapshotterInjected_1.frameSnapshotStreamer.toString() + ')()';
            (_a = frame._existingMainContext()) === null || _a === void 0 ? void 0 : _a.rawEvaluate(initScript).catch(debugExceptionHandler);
        };
        for (const frame of page.frames())
            processNewFrame(frame);
        this._eventListeners.push(helper_1.helper.addEventListener(page, page_1.Page.Events.FrameAttached, processNewFrame));
        // Push streamer interval on navigation.
        this._eventListeners.push(helper_1.helper.addEventListener(page, page_1.Page.Events.InternalFrameNavigatedToNewDocument, frame => {
            setIntervalInFrame(frame, this._interval);
        }));
        // Capture resources.
        this._eventListeners.push(helper_1.helper.addEventListener(page, page_1.Page.Events.Response, (response) => {
            this._saveResource(page, response).catch(e => debugLogger_1.debugLogger.log('error', e));
        }));
    }
    async _saveResource(page, response) {
        const isRedirect = response.status() >= 300 && response.status() <= 399;
        if (isRedirect)
            return;
        // Shortcut all redirects - we cannot intercept them properly.
        let original = response.request();
        while (original.redirectedFrom())
            original = original.redirectedFrom();
        const url = original.url();
        let contentType = '';
        for (const { name, value } of response.headers()) {
            if (name.toLowerCase() === 'content-type')
                contentType = value;
        }
        const method = original.method();
        const status = response.status();
        const requestBody = original.postDataBuffer();
        const requestSha1 = requestBody ? utils_1.calculateSha1(requestBody) : 'none';
        const requestHeaders = original.headers();
        const body = await response.body().catch(e => debugLogger_1.debugLogger.log('error', e));
        const responseSha1 = body ? utils_1.calculateSha1(body) : 'none';
        const resource = {
            pageId: page.uniqueId,
            frameId: response.frame().uniqueId,
            resourceId: 'resource@' + utils_1.createGuid(),
            url,
            contentType,
            responseHeaders: response.headers(),
            requestHeaders,
            method,
            status,
            requestSha1,
            responseSha1,
            timestamp: utils_1.monotonicTime()
        };
        this._delegate.onResourceSnapshot(resource);
        if (requestBody)
            this._delegate.onBlob({ sha1: requestSha1, buffer: requestBody });
        if (body)
            this._delegate.onBlob({ sha1: responseSha1, buffer: body });
    }
}
exports.Snapshotter = Snapshotter;
async function setIntervalInFrame(frame, interval) {
    const context = frame._existingMainContext();
    await (context === null || context === void 0 ? void 0 : context.evaluate(({ kSnapshotStreamer, interval }) => {
        window[kSnapshotStreamer].setSnapshotInterval(interval);
    }, { kSnapshotStreamer: snapshotterInjected_1.kSnapshotStreamer, interval }).catch(debugExceptionHandler));
}
async function annotateFrameHierarchy(frame) {
    try {
        const frameElement = await frame.frameElement();
        const parent = frame.parentFrame();
        if (!parent)
            return;
        const context = await parent._mainContext();
        await (context === null || context === void 0 ? void 0 : context.evaluate(({ kSnapshotStreamer, frameElement, frameId }) => {
            window[kSnapshotStreamer].markIframe(frameElement, frameId);
        }, { kSnapshotStreamer: snapshotterInjected_1.kSnapshotStreamer, frameElement, frameId: frame.uniqueId }));
        frameElement.dispose();
    }
    catch (e) {
    }
}
function debugExceptionHandler(e) {
    // console.error(e);
}
//# sourceMappingURL=snapshotter.js.map