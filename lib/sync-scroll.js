'use babel';

var {CompositeDisposable} = require('atom');

/**
 * Synchronizes scrolling between two editors with soft-wrap and view zone support.
 * Uses direct scrollTop positioning since view zones ensure both editors have
 * equal total content heights.
 */
class SyncScroll {

  constructor(editor1, editor2, syncHorizontalScroll) {
    this._syncHorizontalScroll = syncHorizontalScroll;
    this._subscriptions = new CompositeDisposable();
    this._syncInfo = [{
      editor: editor1,
      editorView: atom.views.getView(editor1),
      scrolling: false,
    }, {
      editor: editor2,
      editorView: atom.views.getView(editor2),
      scrolling: false,
    }];

    this._syncInfo.forEach((editorInfo, i) => {
      // Note that 'onDidChangeScrollTop' isn't technically in the public API.
      this._subscriptions.add(editorInfo.editorView.onDidChangeScrollTop(() => this._scrollPositionChanged(i)));
      // Note that 'onDidChangeScrollLeft' isn't technically in the public API.
      if(this._syncHorizontalScroll) {
        this._subscriptions.add(editorInfo.editorView.onDidChangeScrollLeft(() => this._horizontalScrollChanged(i)));
      }
      // bind this so that the editors line up on start of package
      this._subscriptions.add(editorInfo.editor.emitter.on('did-change-scroll-top', () => this._scrollPositionChanged(i)));
    });
  }

  /**
   * Handles vertical scroll synchronization using direct scrollTop positioning.
   * Since view zones ensure both editors have equal total content heights,
   * we simply copy the scrollTop value directly.
   */
  _scrollPositionChanged(changeScrollIndex) {
    var thisInfo = this._syncInfo[changeScrollIndex];
    var otherInfo = this._syncInfo[1 - changeScrollIndex];

    if (thisInfo.scrolling) {
      return;
    }

    otherInfo.scrolling = true;
    try {
      var scrollTop = thisInfo.editorView.getScrollTop();
      otherInfo.editorView.setScrollTop(scrollTop);
    } catch (e) {
      // Ignore errors
    }
    otherInfo.scrolling = false;
  }

  /**
   * Handles horizontal scroll synchronization.
   * This remains pixel-based since horizontal scrolling is not affected by soft-wrap.
   */
  _horizontalScrollChanged(changeScrollIndex) {
    var thisInfo = this._syncInfo[changeScrollIndex];
    var otherInfo = this._syncInfo[1 - changeScrollIndex];

    if (thisInfo.scrolling) {
      return;
    }

    otherInfo.scrolling = true;
    try {
      otherInfo.editorView.setScrollLeft(thisInfo.editorView.getScrollLeft());
    } catch (e) {
      // Ignore errors
    }
    otherInfo.scrolling = false;
  }

  dispose() {
    if (this._subscriptions) {
      this._subscriptions.dispose();
      this._subscriptions = null;
    }
  }

  syncPositions() {
    var activeTextEditor = atom.workspace.getActiveTextEditor();
    this._syncInfo.forEach((editorInfo) => {
      if(editorInfo.editor == activeTextEditor) {
        editorInfo.editor.emitter.emit('did-change-scroll-top', editorInfo.editorView.getScrollTop());
      }
    });
  }
}

module.exports = SyncScroll;
