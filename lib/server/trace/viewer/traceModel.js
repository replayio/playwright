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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraceModel = exports.trace = void 0;
const utils_1 = require("../../../utils/utils");
exports.trace = __importStar(require("../common/traceEvents"));
class TraceModel {
    constructor() {
        this.contextEntries = new Map();
        this.pageEntries = new Map();
        this.contextResources = new Map();
    }
    appendEvents(events, snapshotStorage) {
        for (const event of events)
            this.appendEvent(event);
        const actions = [];
        for (const context of this.contextEntries.values()) {
            for (const page of context.pages)
                actions.push(...page.actions);
        }
        const resources = snapshotStorage.resources().reverse();
        actions.reverse();
        for (const action of actions) {
            while (resources.length && resources[0].timestamp > action.timestamp)
                action.resources.push(resources.shift());
            action.resources.reverse();
        }
    }
    appendEvent(event) {
        switch (event.type) {
            case 'context-created': {
                this.contextEntries.set(event.contextId, {
                    name: event.debugName || utils_1.createGuid(),
                    startTime: Number.MAX_VALUE,
                    endTime: Number.MIN_VALUE,
                    created: event,
                    destroyed: undefined,
                    pages: [],
                });
                this.contextResources.set(event.contextId, new Map());
                break;
            }
            case 'context-destroyed': {
                this.contextEntries.get(event.contextId).destroyed = event;
                break;
            }
            case 'page-created': {
                const pageEntry = {
                    created: event,
                    destroyed: undefined,
                    actions: [],
                    interestingEvents: [],
                };
                const contextEntry = this.contextEntries.get(event.contextId);
                this.pageEntries.set(event.pageId, { pageEntry, contextEntry });
                contextEntry.pages.push(pageEntry);
                break;
            }
            case 'page-destroyed': {
                this.pageEntries.get(event.pageId).pageEntry.destroyed = event;
                break;
            }
            case 'action': {
                const metadata = event.metadata;
                if (metadata.method === 'waitForEventInfo')
                    break;
                const { pageEntry } = this.pageEntries.get(metadata.pageId);
                const actionId = event.contextId + '/' + metadata.pageId + '/' + pageEntry.actions.length;
                const action = {
                    actionId,
                    resources: [],
                    ...event,
                };
                pageEntry.actions.push(action);
                break;
            }
            case 'dialog-opened':
            case 'dialog-closed':
            case 'navigation':
            case 'load': {
                const { pageEntry } = this.pageEntries.get(event.pageId);
                pageEntry.interestingEvents.push(event);
                break;
            }
        }
        const contextEntry = this.contextEntries.get(event.contextId);
        contextEntry.startTime = Math.min(contextEntry.startTime, event.timestamp);
        contextEntry.endTime = Math.max(contextEntry.endTime, event.timestamp);
    }
    actionById(actionId) {
        const [contextId, pageId, actionIndex] = actionId.split('/');
        const context = this.contextEntries.get(contextId);
        const page = context.pages.find(entry => entry.created.pageId === pageId);
        const action = page.actions[+actionIndex];
        return { context, page, action };
    }
    findPage(pageId) {
        let contextEntry;
        let pageEntry;
        for (const c of this.contextEntries.values()) {
            for (const p of c.pages) {
                if (p.created.pageId === pageId) {
                    contextEntry = c;
                    pageEntry = p;
                }
            }
        }
        return { contextEntry, pageEntry };
    }
}
exports.TraceModel = TraceModel;
//# sourceMappingURL=traceModel.js.map