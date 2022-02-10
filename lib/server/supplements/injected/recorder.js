"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Recorder = void 0;

var _selectorGenerator = require("../../injected/selectorGenerator");

var _highlight = require("../../injected/highlight");

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
class Recorder {
  constructor(injectedScript, params) {
    this._injectedScript = void 0;
    this._performingAction = false;
    this._listeners = [];
    this._hoveredModel = null;
    this._hoveredElement = null;
    this._activeModel = null;
    this._expectProgrammaticKeyUp = false;
    this._pollRecorderModeTimer = void 0;
    this._mode = 'none';
    this._actionPoint = void 0;
    this._actionSelector = void 0;
    this._params = void 0;
    this._highlight = void 0;
    this._params = params;
    this._injectedScript = injectedScript;
    this._highlight = new _highlight.Highlight(params.isUnderTest);

    this._refreshListenersIfNeeded();

    injectedScript.onGlobalListenersRemoved.add(() => this._refreshListenersIfNeeded());

    globalThis._playwrightRefreshOverlay = () => {
      this._pollRecorderMode().catch(e => console.log(e)); // eslint-disable-line no-console

    };

    globalThis._playwrightRefreshOverlay();

    if (params.isUnderTest) console.error('Recorder script ready for test');
  }

  _refreshListenersIfNeeded() {
    // Ensure we are attached to the current document, and we are on top (last element);
    if (this._highlight.isInstalled()) return;
    removeEventListeners(this._listeners);
    this._listeners = [addEventListener(document, 'click', event => this._onClick(event), true), addEventListener(document, 'auxclick', event => this._onClick(event), true), addEventListener(document, 'input', event => this._onInput(event), true), addEventListener(document, 'keydown', event => this._onKeyDown(event), true), addEventListener(document, 'keyup', event => this._onKeyUp(event), true), addEventListener(document, 'mousedown', event => this._onMouseDown(event), true), addEventListener(document, 'mouseup', event => this._onMouseUp(event), true), addEventListener(document, 'mousemove', event => this._onMouseMove(event), true), addEventListener(document, 'mouseleave', event => this._onMouseLeave(event), true), addEventListener(document, 'focus', () => this._onFocus(), true), addEventListener(document, 'scroll', () => {
      this._hoveredModel = null;

      this._highlight.hideActionPoint();

      this._updateHighlight();
    }, true)];

    this._highlight.install();
  }

  async _pollRecorderMode() {
    var _this$_hoveredModel;

    const pollPeriod = 1000;
    if (this._pollRecorderModeTimer) clearTimeout(this._pollRecorderModeTimer);
    const state = await globalThis._playwrightRecorderState().catch(e => null);

    if (!state) {
      this._pollRecorderModeTimer = setTimeout(() => this._pollRecorderMode(), pollPeriod);
      return;
    }

    const {
      mode,
      actionPoint,
      actionSelector
    } = state;

    if (mode !== this._mode) {
      this._mode = mode;

      this._clearHighlight();
    }

    if (actionPoint && this._actionPoint && actionPoint.x === this._actionPoint.x && actionPoint.y === this._actionPoint.y) {// All good.
    } else if (!actionPoint && !this._actionPoint) {// All good.
    } else {
      if (actionPoint) this._highlight.showActionPoint(actionPoint.x, actionPoint.y);else this._highlight.hideActionPoint();
      this._actionPoint = actionPoint;
    } // Race or scroll.


    if (this._actionSelector && !((_this$_hoveredModel = this._hoveredModel) !== null && _this$_hoveredModel !== void 0 && _this$_hoveredModel.elements.length)) this._actionSelector = undefined;

    if (actionSelector !== this._actionSelector) {
      this._hoveredModel = actionSelector ? (0, _selectorGenerator.querySelector)(this._injectedScript, actionSelector, document) : null;

      this._updateHighlight();

      this._actionSelector = actionSelector;
    }

    this._pollRecorderModeTimer = setTimeout(() => this._pollRecorderMode(), pollPeriod);
  }

  _clearHighlight() {
    this._hoveredModel = null;
    this._activeModel = null;

    this._updateHighlight();
  }

  _actionInProgress(event) {
    // If Playwright is performing action for us, bail.
    if (this._performingAction) return true; // Consume as the first thing.

    consumeEvent(event);
    return false;
  }

  _consumedDueToNoModel(event, model) {
    if (model) return false;
    consumeEvent(event);
    return true;
  }

  _consumedDueWrongTarget(event) {
    if (this._activeModel && this._activeModel.elements[0] === this._deepEventTarget(event)) return false;
    consumeEvent(event);
    return true;
  }

  _onClick(event) {
    if (this._mode === 'inspecting') globalThis._playwrightRecorderSetSelector(this._hoveredModel ? this._hoveredModel.selector : '');
    if (this._shouldIgnoreMouseEvent(event)) return;
    if (this._actionInProgress(event)) return;
    if (this._consumedDueToNoModel(event, this._hoveredModel)) return;
    const checkbox = asCheckbox(this._deepEventTarget(event));

    if (checkbox) {
      // Interestingly, inputElement.checked is reversed inside this event handler.
      this._performAction({
        name: checkbox.checked ? 'check' : 'uncheck',
        selector: this._hoveredModel.selector,
        signals: []
      });

      return;
    }

    this._performAction({
      name: 'click',
      selector: this._hoveredModel.selector,
      position: positionForEvent(event),
      signals: [],
      button: buttonForEvent(event),
      modifiers: modifiersForEvent(event),
      clickCount: event.detail
    });
  }

  _shouldIgnoreMouseEvent(event) {
    const target = this._deepEventTarget(event);

    if (this._mode === 'none') return true;

    if (this._mode === 'inspecting') {
      consumeEvent(event);
      return true;
    }

    const nodeName = target.nodeName;
    if (nodeName === 'SELECT') return true;
    if (nodeName === 'INPUT' && ['date'].includes(target.type)) return true;
    return false;
  }

  _onMouseDown(event) {
    if (this._shouldIgnoreMouseEvent(event)) return;
    if (!this._performingAction) consumeEvent(event);
    this._activeModel = this._hoveredModel;
  }

  _onMouseUp(event) {
    if (this._shouldIgnoreMouseEvent(event)) return;
    if (!this._performingAction) consumeEvent(event);
  }

  _onMouseMove(event) {
    if (this._mode === 'none') return;

    const target = this._deepEventTarget(event);

    if (this._hoveredElement === target) return;
    this._hoveredElement = target;

    this._updateModelForHoveredElement();
  }

  _onMouseLeave(event) {
    // Leaving iframe.
    if (this._deepEventTarget(event).nodeType === Node.DOCUMENT_NODE) {
      this._hoveredElement = null;

      this._updateModelForHoveredElement();
    }
  }

  _onFocus() {
    const activeElement = this._deepActiveElement(document);

    const result = activeElement ? (0, _selectorGenerator.generateSelector)(this._injectedScript, activeElement) : null;
    this._activeModel = result && result.selector ? result : null;
    if (this._params.isUnderTest) console.error('Highlight updated for test: ' + (result ? result.selector : null));
  }

  _updateModelForHoveredElement() {
    if (!this._hoveredElement) {
      this._hoveredModel = null;

      this._updateHighlight();

      return;
    }

    const hoveredElement = this._hoveredElement;
    const {
      selector,
      elements
    } = (0, _selectorGenerator.generateSelector)(this._injectedScript, hoveredElement);
    if (this._hoveredModel && this._hoveredModel.selector === selector || this._hoveredElement !== hoveredElement) return;
    this._hoveredModel = selector ? {
      selector,
      elements
    } : null;

    this._updateHighlight();

    if (this._params.isUnderTest) console.error('Highlight updated for test: ' + selector);
  }

  _updateHighlight() {
    const elements = this._hoveredModel ? this._hoveredModel.elements : [];
    const selector = this._hoveredModel ? this._hoveredModel.selector : '';

    this._highlight.updateHighlight(elements, selector, this._mode === 'recording');
  }

  _onInput(event) {
    if (this._mode !== 'recording') return true;

    const target = this._deepEventTarget(event);

    if (['INPUT', 'TEXTAREA'].includes(target.nodeName)) {
      const inputElement = target;
      const elementType = (inputElement.type || '').toLowerCase();

      if (elementType === 'checkbox') {
        // Checkbox is handled in click, we can't let input trigger on checkbox - that would mean we dispatched click events while recording.
        return;
      }

      if (elementType === 'file') {
        globalThis._playwrightRecorderRecordAction({
          name: 'setInputFiles',
          selector: this._activeModel.selector,
          signals: [],
          files: [...(inputElement.files || [])].map(file => file.name)
        });

        return;
      } // Non-navigating actions are simply recorded by Playwright.


      if (this._consumedDueWrongTarget(event)) return;

      globalThis._playwrightRecorderRecordAction({
        name: 'fill',
        selector: this._activeModel.selector,
        signals: [],
        text: inputElement.value
      });
    }

    if (target.nodeName === 'SELECT') {
      const selectElement = target;
      if (this._actionInProgress(event)) return;

      this._performAction({
        name: 'select',
        selector: this._hoveredModel.selector,
        options: [...selectElement.selectedOptions].map(option => option.value),
        signals: []
      });
    }
  }

  _shouldGenerateKeyPressFor(event) {
    // Backspace, Delete, AltGraph are changing input, will handle it there.
    if (['Backspace', 'Delete', 'AltGraph'].includes(event.key)) return false; // Ignore the QWERTZ shortcut for creating a at sign on MacOS

    if (event.key === '@' && event.code === 'KeyL') return false; // Allow and ignore common used shortcut for pasting.

    if (navigator.platform.includes('Mac')) {
      if (event.key === 'v' && event.metaKey) return false;
    } else {
      if (event.key === 'v' && event.ctrlKey) return false;
      if (event.key === 'Insert' && event.shiftKey) return false;
    }

    if (['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) return false;
    const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
    if (event.key.length === 1 && !hasModifier) return !!asCheckbox(this._deepEventTarget(event));
    return true;
  }

  _onKeyDown(event) {
    if (this._mode === 'inspecting') {
      consumeEvent(event);
      return;
    }

    if (this._mode !== 'recording') return;
    if (!this._shouldGenerateKeyPressFor(event)) return;

    if (this._actionInProgress(event)) {
      this._expectProgrammaticKeyUp = true;
      return;
    }

    if (this._consumedDueWrongTarget(event)) return; // Similarly to click, trigger checkbox on key event, not input.

    if (event.key === ' ') {
      const checkbox = asCheckbox(this._deepEventTarget(event));

      if (checkbox) {
        this._performAction({
          name: checkbox.checked ? 'uncheck' : 'check',
          selector: this._activeModel.selector,
          signals: []
        });

        return;
      }
    }

    this._performAction({
      name: 'press',
      selector: this._activeModel.selector,
      signals: [],
      key: event.key,
      modifiers: modifiersForEvent(event)
    });
  }

  _onKeyUp(event) {
    if (this._mode === 'none') return;
    if (!this._shouldGenerateKeyPressFor(event)) return; // Only allow programmatic keyups, ignore user input.

    if (!this._expectProgrammaticKeyUp) {
      consumeEvent(event);
      return;
    }

    this._expectProgrammaticKeyUp = false;
  }

  async _performAction(action) {
    this._performingAction = true;
    await globalThis._playwrightRecorderPerformAction(action).catch(() => {});
    this._performingAction = false; // Action could have changed DOM, update hovered model selectors.

    this._updateModelForHoveredElement(); // If that was a keyboard action, it similarly requires new selectors for active model.


    this._onFocus();

    if (this._params.isUnderTest) {
      // Serialize all to string as we cannot attribute console message to isolated world
      // in Firefox.
      console.error('Action performed for test: ' + JSON.stringify({
        hovered: this._hoveredModel ? this._hoveredModel.selector : null,
        active: this._activeModel ? this._activeModel.selector : null
      }));
    }
  }

  _deepEventTarget(event) {
    return event.composedPath()[0];
  }

  _deepActiveElement(document) {
    let activeElement = document.activeElement;

    while (activeElement && activeElement.shadowRoot && activeElement.shadowRoot.activeElement) activeElement = activeElement.shadowRoot.activeElement;

    return activeElement;
  }

}

exports.Recorder = Recorder;

function modifiersForEvent(event) {
  return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
}

function buttonForEvent(event) {
  switch (event.which) {
    case 1:
      return 'left';

    case 2:
      return 'middle';

    case 3:
      return 'right';
  }

  return 'left';
}

function positionForEvent(event) {
  const targetElement = event.target;
  if (targetElement.nodeName !== 'CANVAS') return;
  return {
    x: event.offsetX,
    y: event.offsetY
  };
}

function consumeEvent(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function asCheckbox(node) {
  if (!node || node.nodeName !== 'INPUT') return null;
  const inputElement = node;
  return inputElement.type === 'checkbox' ? inputElement : null;
}

function addEventListener(target, eventName, listener, useCapture) {
  target.addEventListener(eventName, listener, useCapture);

  const remove = () => {
    target.removeEventListener(eventName, listener, useCapture);
  };

  return remove;
}

function removeEventListeners(listeners) {
  for (const listener of listeners) listener();

  listeners.splice(0, listeners.length);
}

var _default = Recorder;
exports.default = _default;