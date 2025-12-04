'use babel';

var {CompositeDisposable} = require('atom');

/**
 * Synchronizes scrolling between two editors with soft-wrap support.
 * Uses buffer line positions as the synchronization anchor, allowing
 * proper alignment even when editors have different soft-wrap settings
 * or different window widths.
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
   * Handles vertical scroll synchronization using buffer-line-based positioning.
   * This approach works correctly with soft-wrap by finding the buffer line at
   * the top of the viewport and scrolling the other editor to show that same
   * buffer line, regardless of how many screen lines it spans in each editor.
   */
  _scrollPositionChanged(changeScrollIndex) {
    var thisInfo = this._syncInfo[changeScrollIndex];
    var otherInfo = this._syncInfo[1 - changeScrollIndex];

    if (thisInfo.scrolling) {
      return;
    }

    otherInfo.scrolling = true;
    try {
      var thisEditor = thisInfo.editor;
      var otherEditor = otherInfo.editor;
      var thisView = thisInfo.editorView;
      var otherView = otherInfo.editorView;

      var scrollTop = thisView.getScrollTop();
      var lineHeight = thisEditor.getLineHeightInPixels();

      // Calculate which screen row is at the top of the viewport
      var firstVisibleScreenRow = Math.floor(scrollTop / lineHeight);
      // Calculate fractional offset within that line (for smooth scrolling)
      var fractionalOffset = scrollTop - (firstVisibleScreenRow * lineHeight);

      // Convert screen row to buffer row (handles soft-wrap)
      var bufferRow = thisEditor.bufferRowForScreenRow(firstVisibleScreenRow);

      // In the other editor, find the screen row for that buffer row
      var targetScreenRow = otherEditor.screenRowForBufferRow(bufferRow);

      // Calculate the target scroll position
      var otherLineHeight = otherEditor.getLineHeightInPixels();
      var targetScrollTop = (targetScreenRow * otherLineHeight) + fractionalOffset;

      otherView.setScrollTop(targetScrollTop);
    } catch (e) {
      // Fallback to simple scroll sync if buffer/screen row conversion fails
      try {
        otherInfo.editorView.setScrollTop(thisInfo.editorView.getScrollTop());
      } catch (e2) {
        // Ignore errors
      }
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
