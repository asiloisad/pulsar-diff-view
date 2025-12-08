'use strict';

var {CompositeDisposable} = require('atom');

module.exports = class FooterView {
  constructor(isWhitespaceIgnored, disableIgnoreWhitespace, isAutoDiffEnabled, disableAutoDiff, isSoftWrapEnabled) {
    this._subscriptions = new CompositeDisposable();

    // create root UI element
    this.element = document.createElement('div');
    this.element.classList.add('diff-view-ui');

    // ------------
    // LEFT COLUMN |
    // ------------

    // create prev diff button
    const prevDiffButton = document.createElement('button');
    prevDiffButton.classList.add('btn', 'btn-md', 'prev-diff');
    prevDiffButton.onclick = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'diff-view:prev-diff');
    };
    this._subscriptions.add(atom.tooltips.add(prevDiffButton, {title: 'Previous Diff'}));

    // create next diff button
    const nextDiffButton = document.createElement('button');
    nextDiffButton.classList.add('btn', 'btn-md', 'next-diff');
    nextDiffButton.onclick = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'diff-view:next-diff');
    };
    this._subscriptions.add(atom.tooltips.add(nextDiffButton, {title: 'Next Diff'}));

    // create selection counter
    this.selectionCountValue = document.createElement('span');
    this.selectionCountValue.classList.add('selection-count-value');
    this.element.appendChild(this.selectionCountValue);

    // create selection divider
    const selectionDivider = document.createElement('span');
    selectionDivider.textContent = '/';
    selectionDivider.classList.add('selection-divider');
    this.element.appendChild(selectionDivider);

    // create selection count container
    this.selectionCount = document.createElement('div');
    this.selectionCount.classList.add('selection-count', 'hidden');
    this.selectionCount.appendChild(this.selectionCountValue);
    this.selectionCount.appendChild(selectionDivider);

    // create number of differences value
    this.numDifferencesValue = document.createElement('span');
    this.numDifferencesValue.classList.add('num-diff-value', 'diff-view-loading-icon');

    // create number of differences text
    this.numDifferencesText = document.createElement('span');
    this.numDifferencesText.textContent = 'differences';
    this.numDifferencesText.classList.add('num-diff-text');

    // create number of differences container
    const numDifferences = document.createElement('div');
    numDifferences.classList.add('num-diff');
    numDifferences.appendChild(this.numDifferencesValue);
    numDifferences.appendChild(this.numDifferencesText);

    // create left column
    const left = document.createElement('div');
    left.classList.add('left');
    left.appendChild(prevDiffButton);
    left.appendChild(nextDiffButton);
    left.appendChild(this.selectionCount);
    left.appendChild(numDifferences);
    this.element.appendChild(left);

    // -----------
    // MID COLUMN |
    // -----------

    // create copy to left button
    const copyToLeftButton = document.createElement('button');
    copyToLeftButton.classList.add('btn', 'btn-md', 'copy-to-left');
    copyToLeftButton.onclick = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'diff-view:copy-to-left');
    };
    this._subscriptions.add(atom.tooltips.add(copyToLeftButton, {title: 'Copy to Left'}));

    // create copy to right button
    const copyToRightButton = document.createElement('button');
    copyToRightButton.classList.add('btn', 'btn-md', 'copy-to-right');
    copyToRightButton.onclick = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'diff-view:copy-to-right');
    };
    this._subscriptions.add(atom.tooltips.add(copyToRightButton, {title: 'Copy to Right'}));

    // create mid column
    const mid = document.createElement('div');
    mid.classList.add('mid');
    mid.appendChild(copyToLeftButton);
    mid.appendChild(copyToRightButton);
    this.element.appendChild(mid);

    // -------------
    // RIGHT COLUMN |
    // -------------

    // create ignore whitespace toggle button
    this.ignoreWhitespaceBtn = document.createElement('button');
    this.ignoreWhitespaceBtn.classList.add('btn', 'btn-md', 'ignore-whitespace');
    if (isWhitespaceIgnored) {
      this.ignoreWhitespaceBtn.classList.add('selected');
    }
    if (disableIgnoreWhitespace) {
      this.ignoreWhitespaceBtn.disabled = true;
    }
    this.ignoreWhitespaceBtn.onclick = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'diff-view:set-ignore-whitespace');
    };
    this._subscriptions.add(atom.tooltips.add(this.ignoreWhitespaceBtn, {title: 'Ignore Whitespace'}));

    // create auto diff toggle button
    this.autoDiffBtn = document.createElement('button');
    this.autoDiffBtn.classList.add('btn', 'btn-md', 'auto-diff');
    if (isAutoDiffEnabled) {
      this.autoDiffBtn.classList.add('selected');
    }
    if (disableAutoDiff) {
      this.autoDiffBtn.disabled = true;
    }
    this.autoDiffBtn.onclick = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'diff-view:set-auto-diff');
    };
    this._subscriptions.add(atom.tooltips.add(this.autoDiffBtn, {title: 'Auto Diff'}));

    // create soft-wrap toggle button
    this.softWrapBtn = document.createElement('button');
    this.softWrapBtn.classList.add('btn', 'btn-md', 'soft-wrap');
    if (isSoftWrapEnabled) {
      this.softWrapBtn.classList.add('selected');
    }
    this.softWrapBtn.onclick = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'diff-view:toggle-soft-wrap');
    };
    this._subscriptions.add(atom.tooltips.add(this.softWrapBtn, {title: 'Soft Wrap'}));

    // create equalize widths button
    const equalizeWidthsButton = document.createElement('button');
    equalizeWidthsButton.classList.add('btn', 'btn-md', 'equalize-widths');
    equalizeWidthsButton.onclick = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'diff-view:equalize-widths');
    };
    this._subscriptions.add(atom.tooltips.add(equalizeWidthsButton, {title: 'Equalize Widths'}));

    // create center line toggle button
    this.centerLineBtn = document.createElement('button');
    this.centerLineBtn.classList.add('btn', 'btn-md', 'center-line');
    this.centerLineBtn.onclick = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'diff-view:toggle-center-line');
    };
    this._subscriptions.add(atom.tooltips.add(this.centerLineBtn, {title: 'Show Center Line'}));

    // create close button
    const closeButton = document.createElement('button');
    closeButton.classList.add('btn', 'btn-md', 'close-diff');
    closeButton.onclick = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'diff-view:close');
    };
    this._subscriptions.add(atom.tooltips.add(closeButton, {title: 'Close Diff View'}));

    // create right column
    const right = document.createElement('div');
    right.classList.add('right');
    right.appendChild(this.ignoreWhitespaceBtn);
    right.appendChild(this.autoDiffBtn);
    right.appendChild(this.softWrapBtn);
    right.appendChild(equalizeWidthsButton);
    right.appendChild(this.centerLineBtn);
    right.appendChild(closeButton);
    this.element.appendChild(right);
  }

  destroy() {
    document.body.classList.remove('diff-view-visible');
    if (this._subscriptions) {
      this._subscriptions.dispose();
      this._subscriptions = null;
    }
    this.element.remove();
    this.footerPanel.destroy();
  }

  getElement() {
    return this.element;
  }

  createPanel() {
    this.footerPanel = atom.workspace.addBottomPanel({ item: this.element });
  }

  show() {
    this.footerPanel.show();
    document.body.classList.add('diff-view-visible');
  }

  hide() {
    this.footerPanel.hide();
    document.body.classList.remove('diff-view-visible');
  }

  setLoading() {
    this.numDifferencesValue.textContent = null;
    this.numDifferencesValue.classList.add('diff-view-loading-icon');
  }

  setNumDifferences(num) {
    this.numDifferencesValue.classList.remove('diff-view-loading-icon');
    if (num === 1) {
      this.numDifferencesText.textContent = 'difference';
    } else {
      this.numDifferencesText.textContent = 'differences';
    }
    this.numDifferencesValue.textContent = num;
  }

  showSelectionCount(count) {
    this.selectionCountValue.textContent = count;
    this.selectionCount.classList.remove('hidden');
  }

  hideSelectionCount() {
    this.selectionCount.classList.add('hidden');
  }

  setIgnoreWhitespace(isWhitespaceIgnored) {
    this.ignoreWhitespaceBtn.classList.toggle('selected', isWhitespaceIgnored);
  }

  setAutoDiff(isAutoDiffEnabled) {
    this.autoDiffBtn.classList.toggle('selected', isAutoDiffEnabled);
  }

  setSoftWrap(isSoftWrapEnabled) {
    this.softWrapBtn.classList.toggle('selected', isSoftWrapEnabled);
  }

  setCenterLine(isCenterLineEnabled) {
    this.centerLineBtn.classList.toggle('selected', isCenterLineEnabled);
  }
};
