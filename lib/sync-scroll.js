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
   * Uses the CENTER of the viewport as the anchor point for alignment, which
   * provides better visual alignment when soft-wrap or offset decorations cause
   * different line heights between editors.
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
      var viewportHeight = thisView.getHeight();

      // Use the CENTER of the viewport as anchor point
      var centerOffset = viewportHeight / 2;
      var centerPixelPosition = scrollTop + centerOffset;

      // Calculate which screen row is at the center of the viewport
      var centerScreenRow = Math.floor(centerPixelPosition / lineHeight);
      // Calculate fractional offset within that screen row (for smooth scrolling)
      var fractionalOffset = centerPixelPosition - (centerScreenRow * lineHeight);

      // Convert screen row to buffer row (handles soft-wrap)
      var bufferRow = thisEditor.bufferRowForScreenRow(centerScreenRow);

      // Calculate the offset within the wrapped line
      // (which screen row of this buffer line are we on?)
      var firstScreenRowOfBuffer = thisEditor.screenRowForBufferRow(bufferRow);
      var screenRowOffsetWithinLine = centerScreenRow - firstScreenRowOfBuffer;

      // In the other editor, find the first screen row for that buffer row
      var otherFirstScreenRow = otherEditor.screenRowForBufferRow(bufferRow);

      // Calculate how many screen rows this buffer line spans in other editor
      var otherNextBufferRow = Math.min(bufferRow + 1, otherEditor.getLastBufferRow());
      var otherNextScreenRow = otherEditor.screenRowForBufferRow(otherNextBufferRow);
      var otherScreenRowsForLine = (bufferRow === otherEditor.getLastBufferRow())
        ? otherEditor.getLastScreenRow() - otherFirstScreenRow + 1
        : otherNextScreenRow - otherFirstScreenRow;

      // Calculate how many screen rows this buffer line spans in this editor
      var thisNextBufferRow = Math.min(bufferRow + 1, thisEditor.getLastBufferRow());
      var thisNextScreenRow = thisEditor.screenRowForBufferRow(thisNextBufferRow);
      var thisScreenRowsForLine = (bufferRow === thisEditor.getLastBufferRow())
        ? thisEditor.getLastScreenRow() - firstScreenRowOfBuffer + 1
        : thisNextScreenRow - firstScreenRowOfBuffer;

      // Calculate proportional position within the wrapped line
      var proportionWithinLine = (thisScreenRowsForLine > 1)
        ? (screenRowOffsetWithinLine + fractionalOffset / lineHeight) / thisScreenRowsForLine
        : fractionalOffset / lineHeight;

      // Map to target screen row in other editor
      var targetScreenRowOffset = proportionWithinLine * otherScreenRowsForLine;
      var targetScreenRow = otherFirstScreenRow + Math.floor(targetScreenRowOffset);
      var targetFractionalOffset = (targetScreenRowOffset - Math.floor(targetScreenRowOffset));

      // Calculate the target scroll position to center on that row
      var otherLineHeight = otherEditor.getLineHeightInPixels();
      var otherViewportHeight = otherView.getHeight();
      var otherCenterOffset = otherViewportHeight / 2;
      var targetCenterPixel = (targetScreenRow * otherLineHeight) + (targetFractionalOffset * otherLineHeight);
      var targetScrollTop = targetCenterPixel - otherCenterOffset;

      // Clamp to valid scroll range
      var maxScrollTop = otherView.getScrollHeight() - otherViewportHeight;
      targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

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
