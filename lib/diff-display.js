'use babel'

import EditorDiffExtender from './editor-diff-extender';
import ComputeWordDiff from './compute-word-diff';

var {CompositeDisposable} = require('atom');

module.exports = class DiffView {
  /*
   * @param editors Array of editors being diffed.
   */
  constructor(editors) {
    this._editorDiffExtender1 = new EditorDiffExtender(editors.editor1);
    this._editorDiffExtender2 = new EditorDiffExtender(editors.editor2);
    this._chunks = [];
    this._isSelectionActive = false;
    this._selectedChunkIndex = 0;
    this._COPY_HELP_MESSAGE = 'No differences selected.';
    this._markerLayers = {};
    this._subscriptions = new CompositeDisposable();

    // Set up soft-wrap change listeners for dynamic updates
    this._setupSoftWrapListeners(editors.editor1, editors.editor2);
  }

  /**
   * Sets up listeners for soft-wrap changes and resize events on both editors.
   * When soft-wrap settings or editor widths change, we recalculate view zone heights.
   * Note: We always recalculate because long lines can wrap even without
   * explicit soft-wrap when they exceed the editor width.
   */
  _setupSoftWrapListeners(editor1, editor2) {
    // Listen for soft-wrap changes on both editors
    this._subscriptions.add(editor1.onDidChangeSoftWrapped(() => {
      this._onSoftWrapChanged();
    }));
    this._subscriptions.add(editor2.onDidChangeSoftWrapped(() => {
      this._onSoftWrapChanged();
    }));

    // Set up resize observer to handle editor width changes
    // When editor width changes, wrapped line heights can change
    this._setupResizeObserver(editor1, editor2);
  }

  /**
   * Sets up a ResizeObserver to monitor editor size changes.
   * Recalculates view zone heights when editor dimensions change.
   * Note: Always recalculate because long lines can wrap even without
   * soft-wrap enabled when they exceed the editor width.
   */
  _setupResizeObserver(editor1, editor2) {
    // Throttle resize handling to avoid excessive recalculations
    var resizeTimeout = null;
    var self = this;

    this._resizeObserver = new ResizeObserver(function(entries) {
      // Throttle: only recalculate after resize stops for 100ms
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(function() {
        // Always recalculate - long lines can wrap even without soft-wrap
        self._syncViewZoneHeights();
      }, 100);
    });

    var view1 = atom.views.getView(editor1);
    var view2 = atom.views.getView(editor2);

    if (view1) {
      this._resizeObserver.observe(view1);
    }
    if (view2) {
      this._resizeObserver.observe(view2);
    }
  }

  /**
   * Called when soft-wrap settings change on either editor.
   * Recalculates view zone heights to maintain proper alignment.
   */
  _onSoftWrapChanged() {
    // Use requestAnimationFrame to batch updates and avoid layout thrashing
    requestAnimationFrame(() => {
      this._syncViewZoneHeights();
    });
  }

  /**
   * Synchronizes view zone heights between the two editors using VS Code-style
   * line-by-line alignment. For each corresponding buffer line, if the screen
   * heights differ (due to wrapping), a view zone is added to the shorter side.
   *
   * This handles both explicit soft-wrap and implicit wrapping when long lines
   * exceed the editor width.
   */
  _syncViewZoneHeights() {
    var editor1 = this._editorDiffExtender1.getEditor();
    var editor2 = this._editorDiffExtender2.getEditor();

    // Clear any existing dynamic view zones first
    this._editorDiffExtender1.clearDynamicViewZones();
    this._editorDiffExtender2.clearDynamicViewZones();

    // Current position in each editor (buffer line numbers)
    var pos1 = 0;
    var pos2 = 0;

    // Track cumulative height difference
    var heightDiff = 0; // positive = editor1 taller, negative = editor2 taller

    // Process chunks and unchanged regions
    var chunks = this._chunks || [];

    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i];

      // === Process unchanged region before this chunk (line by line) ===
      this._syncUnchangedRegion(pos1, chunk.oldLineStart, pos2, chunk.newLineStart);

      // === Process the chunk itself ===
      // For changed regions, compare total heights and add single view zone
      // Note: Static offsets are already rendered by setLineOffsets(), so we only
      // need to account for wrapping differences within the chunk content itself
      var chunkHeight1 = this._editorDiffExtender1.getBufferRangeHeight(chunk.oldLineStart, chunk.oldLineEnd);
      var chunkHeight2 = this._editorDiffExtender2.getBufferRangeHeight(chunk.newLineStart, chunk.newLineEnd);

      var chunkDiff = chunkHeight1 - chunkHeight2;
      if (chunkDiff > 0) {
        // Editor 1 chunk is taller (or has more wrapped content), add spacer to editor 2
        // For non-empty chunks: place after the last line of content
        // For empty chunks (pure deletion): place before chunk position (matching static offset)
        var position = chunk.newLineEnd > chunk.newLineStart
          ? chunk.newLineEnd - 1
          : chunk.newLineStart - 1;
        if (position >= 0) {
          this._editorDiffExtender2.setViewZoneHeight(position, chunkDiff, 'after');
        }
      } else if (chunkDiff < 0) {
        // Editor 2 chunk is taller, add spacer to editor 1
        // For non-empty chunks: place after the last line of content
        // For empty chunks (pure addition): place before chunk position (matching static offset)
        var position = chunk.oldLineEnd > chunk.oldLineStart
          ? chunk.oldLineEnd - 1
          : chunk.oldLineStart - 1;
        if (position >= 0) {
          this._editorDiffExtender1.setViewZoneHeight(position, -chunkDiff, 'after');
        }
      }

      // Update positions to end of this chunk
      pos1 = chunk.oldLineEnd;
      pos2 = chunk.newLineEnd;
    }

    // === Process remaining unchanged lines after last chunk ===
    var lastLine1 = editor1.getLastBufferRow() + 1;
    var lastLine2 = editor2.getLastBufferRow() + 1;

    this._syncUnchangedRegion(pos1, lastLine1, pos2, lastLine2);
  }

  /**
   * Synchronizes an unchanged region line by line.
   * For each corresponding buffer line, compares screen heights and adds
   * view zones where they differ.
   *
   * @param start1 Start buffer line in editor 1
   * @param end1 End buffer line in editor 1 (exclusive)
   * @param start2 Start buffer line in editor 2
   * @param end2 End buffer line in editor 2 (exclusive)
   */
  _syncUnchangedRegion(start1, end1, start2, end2) {
    var lineCount = Math.min(end1 - start1, end2 - start2);

    for (var i = 0; i < lineCount; i++) {
      var line1 = start1 + i;
      var line2 = start2 + i;

      var height1 = this._editorDiffExtender1.getWrappedLineHeight(line1);
      var height2 = this._editorDiffExtender2.getWrappedLineHeight(line2);

      var diff = height1 - height2;
      if (diff > 0) {
        // Line in editor 1 is taller (wraps more), add spacer to editor 2
        this._editorDiffExtender2.setViewZoneHeight(line2, diff, 'after');
      } else if (diff < 0) {
        // Line in editor 2 is taller (wraps more), add spacer to editor 1
        this._editorDiffExtender1.setViewZoneHeight(line1, -diff, 'after');
      }
    }
  }

  /**
   * Gets the static offset (in number of lines) at a given line number.
   *
   * @param offsets The offset map (oldLineOffsets or newLineOffsets).
   * @param lineNumber The line number to check.
   * @return The number of offset lines at that position.
   */
  _getStaticOffsetAtLine(offsets, lineNumber) {
    if (!offsets) return 0;
    return offsets[lineNumber] || 0;
  }

  /**
   * Adds highlighting to the editors to show the diff.
   *
   * @param diff The diff to highlight.
   * @param addedColorSide The side that the added highlights should be applied to. Either 'left' or 'right'.
   * @param isWordDiffEnabled Whether differences between words per line should be highlighted.
   * @param isWhitespaceIgnored Whether whitespace should be ignored.
   * @param useCustomStyle Whether to use the user's customized highlight colors.
   */
  displayDiff(diff, addedColorSide, isWordDiffEnabled, isWhitespaceIgnored, useCustomStyle) {
    this._chunks = diff.chunks || [];

    var leftHighlightType = 'added';
    var rightHighlightType = 'removed';
    if(addedColorSide == 'right') {
      leftHighlightType = 'removed';
      rightHighlightType = 'added';
    }
    if(useCustomStyle) {
      leftHighlightType += '-custom';
      rightHighlightType += '-custom';
    }

    for(var chunk of this._chunks) {
      this._editorDiffExtender1.highlightLines(chunk.oldLineStart, chunk.oldLineEnd, leftHighlightType);
      this._editorDiffExtender2.highlightLines(chunk.newLineStart, chunk.newLineEnd, rightHighlightType);

      if(isWordDiffEnabled) {
        this._highlightWordsInChunk(chunk, leftHighlightType, rightHighlightType, isWhitespaceIgnored);
      }
    }

    this._oldLineOffsets = diff.oldLineOffsets || {};
    this._newLineOffsets = diff.newLineOffsets || {};
    this._editorDiffExtender1.setLineOffsets(this._oldLineOffsets);
    this._editorDiffExtender2.setLineOffsets(this._newLineOffsets);

    this._markerLayers = {
      editor1: {
        id: this._editorDiffExtender1.getEditor().id,
        lineMarkerLayer: this._editorDiffExtender1.getLineMarkerLayer(),
        highlightType: leftHighlightType,
        selectionMarkerLayer: this._editorDiffExtender1.getSelectionMarkerLayer()
      },
      editor2: {
        id: this._editorDiffExtender2.getEditor().id,
        lineMarkerLayer: this._editorDiffExtender2.getLineMarkerLayer(),
        highlightType: rightHighlightType,
        selectionMarkerLayer: this._editorDiffExtender2.getSelectionMarkerLayer()
      }
    }

    // Sync view zone heights for soft-wrap alignment
    requestAnimationFrame(() => {
      this._syncViewZoneHeights();
    });
  }

  /**
   * Clears the diff highlighting and offsets from the editors.
   */
  clearDiff() {
    this._editorDiffExtender1.destroyMarkers();
    this._editorDiffExtender2.destroyMarkers();
  }

  /**
   * Called to move the current selection highlight to the next diff chunk.
   * @param isSyncScrollEnabled Only autoscroll one editor if sync scroll is enabled or we will get in an infinite loop
   */
  nextDiff(isSyncScrollEnabled) {
    if(this._isSelectionActive) {
      this._selectedChunkIndex++;
      if(this._selectedChunkIndex >= this.getNumDifferences()) {
        this._selectedChunkIndex = 0;
      }
    } else {
      this._isSelectionActive = true;
    }

    var success = this._selectChunk(this._selectedChunkIndex, true, isSyncScrollEnabled);
    if(!success) {
        return -1;
    }

    return this._selectedChunkIndex;
  }

  /**
   * Called to move the current selection highlight to the previous diff chunk.
   * @param isSyncScrollEnabled Only autoscroll one editor if sync scroll is enabled or we will get in an infinite loop
   */
  prevDiff(isSyncScrollEnabled) {
    if(this._isSelectionActive) {
      this._selectedChunkIndex--;
      if(this._selectedChunkIndex < 0) {
        this._selectedChunkIndex = this.getNumDifferences() - 1
      }
    } else {
      this._isSelectionActive = true;
    }

    var success = this._selectChunk(this._selectedChunkIndex, true, isSyncScrollEnabled);
    if(!success) {
        return -1;
    }

    return this._selectedChunkIndex;
  }

  /**
   * Copies the currently selected diff chunk from the left editor to the right
   * editor.
   */
  copyToRight() {
    var foundSelection = false;
    var offset = 0; // keep track of line offset (used when there are multiple chunks being moved)

    for(var diffChunk of this._chunks) {
      if(diffChunk.isSelected) {
        foundSelection = true;

        var textToCopy = this._editorDiffExtender1.getEditor().getTextInBufferRange([[diffChunk.oldLineStart, 0], [diffChunk.oldLineEnd, 0]]);
        var lastBufferRow = this._editorDiffExtender2.getEditor().getLastBufferRow();

        // insert new line if the chunk we want to copy will be below the last line of the other editor
        if((diffChunk.newLineStart + offset) > lastBufferRow) {
          this._editorDiffExtender2.getEditor().setCursorBufferPosition([lastBufferRow, 0], {autoscroll: false});
          this._editorDiffExtender2.getEditor().insertNewline();
        }

        this._editorDiffExtender2.getEditor().setTextInBufferRange([[diffChunk.newLineStart + offset, 0], [diffChunk.newLineEnd + offset, 0]], textToCopy);
        // offset will be the amount of lines to be copied minus the amount of lines overwritten
        offset += (diffChunk.oldLineEnd - diffChunk.oldLineStart) - (diffChunk.newLineEnd - diffChunk.newLineStart);
        // move the selection pointer back so the next diff chunk is not skipped
        if(this._editorDiffExtender1.hasSelection() || this._editorDiffExtender2.hasSelection()) {
          this._selectedChunkIndex--;
        }
      }
    }

    if(!foundSelection) {
      atom.notifications.addWarning('Split Diff', {detail: this._COPY_HELP_MESSAGE, dismissable: false, icon: 'diff'});
    }
  }

  /**
   * Copies the currently selected diff chunk from the right editor to the left
   * editor.
   */
  copyToLeft() {
    var foundSelection = false;
    var offset = 0; // keep track of line offset (used when there are multiple chunks being moved)

    for(var diffChunk of this._chunks) {
      if(diffChunk.isSelected) {
        foundSelection = true;

        var textToCopy = this._editorDiffExtender2.getEditor().getTextInBufferRange([[diffChunk.newLineStart, 0], [diffChunk.newLineEnd, 0]]);
        var lastBufferRow = this._editorDiffExtender1.getEditor().getLastBufferRow();
        // insert new line if the chunk we want to copy will be below the last line of the other editor
        if((diffChunk.oldLineStart + offset) > lastBufferRow) {
          this._editorDiffExtender1.getEditor().setCursorBufferPosition([lastBufferRow, 0], {autoscroll: false});
          this._editorDiffExtender1.getEditor().insertNewline();
        }

        this._editorDiffExtender1.getEditor().setTextInBufferRange([[diffChunk.oldLineStart + offset, 0], [diffChunk.oldLineEnd + offset, 0]], textToCopy);
        // offset will be the amount of lines to be copied minus the amount of lines overwritten
        offset += (diffChunk.newLineEnd - diffChunk.newLineStart) - (diffChunk.oldLineEnd - diffChunk.oldLineStart);
        // move the selection pointer back so the next diff chunk is not skipped
        if(this._editorDiffExtender1.hasSelection() || this._editorDiffExtender2.hasSelection()) {
          this._selectedChunkIndex--;
        }
      }
    }

    if(!foundSelection) {
      atom.notifications.addWarning('Split Diff', {detail: this._COPY_HELP_MESSAGE, dismissable: false, icon: 'diff'});
    }
  }

  /**
   * Cleans up the editor indicated by index. A clean up will remove the editor
   * or the pane if necessary. Typically left editor == 1 and right editor == 2.
   *
   * @param editorIndex The index of the editor to clean up.
   */
  cleanUpEditor(editorIndex) {
    if(editorIndex === 1) {
      this._editorDiffExtender1.cleanUp();
    } else if(editorIndex === 2) {
      this._editorDiffExtender2.cleanUp();
    }
  }

  /**
   * Restores soft wrap to the appropriate editor.
   * @param editorIndex The index of the editor to restore soft wrap to.
   */
  restoreEditorSoftWrap(editorIndex) {
    if(editorIndex === 1) {
      this._editorDiffExtender1.getEditor().setSoftWrapped(true);
    } else if(editorIndex === 2) {
      this._editorDiffExtender2.getEditor().setSoftWrapped(true);
    }
  }

  /**
   * Destroys the editor diff extenders and cleans up subscriptions.
   */
  destroy() {
    if (this._subscriptions) {
      this._subscriptions.dispose();
      this._subscriptions = null;
    }
    // Disconnect resize observer
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this._editorDiffExtender1.destroy();
    this._editorDiffExtender2.destroy();
  }

  /**
   * Gets the number of differences between the editors.
   *
   * @return int The number of differences between the editors.
   */
  getNumDifferences() {
    return Array.isArray(this._chunks) ? this._chunks.length : 0;
  }

  /**
   * Gets the marker layers in use by the editors.
   * @return An object containing the marker layers and approriate information.
   */
  getMarkerLayers() {
    return this._markerLayers;
  }

  /**
   * Handles when the cursor moves in the editor. Will highlight chunks that have a cursor in them.
   * @param cursor The cursor object from the event.
   * @param oldBufferPosition The old position of the cursor in the buffer.
   * @param newBufferPosition The new position of the cursor in the buffer.
   */
  handleCursorChange(cursor, oldBufferPosition, newBufferPosition) {
    var editorIndex = (cursor.editor === this._editorDiffExtender1.getEditor()) ? 1 : 2;
    var oldPositionChunkIndex = this._getChunkIndexByLineNumber(editorIndex, oldBufferPosition.row);
    var newPositionChunkIndex = this._getChunkIndexByLineNumber(editorIndex, newBufferPosition.row);

    if(oldPositionChunkIndex >= 0) {
      var diffChunk = this._chunks[oldPositionChunkIndex];
      diffChunk.isSelected = false;
      this._editorDiffExtender1.deselectLines(diffChunk.oldLineStart, diffChunk.oldLineEnd);
      this._editorDiffExtender2.deselectLines(diffChunk.newLineStart, diffChunk.newLineEnd);
    }
    if(newPositionChunkIndex >= 0) {
      this._selectChunk(newPositionChunkIndex, false);
    }
  }

  // ----------------------------------------------------------------------- //
  // --------------------------- PRIVATE METHODS --------------------------- //
  // ----------------------------------------------------------------------- //

  /**
   * Selects and highlights the diff chunk in both editors according to the
   * given index.
   *
   * @param index The index of the diff chunk to highlight in both editors.
   * @param isNextOrPrev Whether we are moving to a direct sibling (if not, this is a click)
   * @param isSyncScrollEnabled Only autoscroll one editor if sync scroll is enabled or we will get in an infinite loop
   */
  _selectChunk(index, isNextOrPrev, isSyncScrollEnabled) {
    var diffChunk = this._chunks[index];
    if(diffChunk != null) {
      diffChunk.isSelected = true;

      if(isNextOrPrev) {
        // deselect previous next/prev highlights
        this._editorDiffExtender1.deselectAllLines();
        this._editorDiffExtender2.deselectAllLines();
        // scroll the editors to position diff at 1/3 of screen height
        this._editorDiffExtender1.getEditor().setCursorBufferPosition([diffChunk.oldLineStart, 0], {autoscroll: false});
        this._scrollToPositionAtFraction(this._editorDiffExtender1.getEditor(), diffChunk.oldLineStart, 1/3);
        this._editorDiffExtender2.getEditor().setCursorBufferPosition([diffChunk.newLineStart, 0], {autoscroll: false});
        if(!isSyncScrollEnabled) {
          this._scrollToPositionAtFraction(this._editorDiffExtender2.getEditor(), diffChunk.newLineStart, 1/3);
        }
      }

      // highlight selection in both editors
      this._editorDiffExtender1.selectLines(diffChunk.oldLineStart, diffChunk.oldLineEnd);
      this._editorDiffExtender2.selectLines(diffChunk.newLineStart, diffChunk.newLineEnd);

      return true;
    }

    return false;
  }

  /**
   * Scrolls the editor so that the given buffer row appears at a specific
   * fraction of the visible height (0 = top, 0.5 = center, 1 = bottom).
   * @param editor The text editor to scroll.
   * @param bufferRow The buffer row to scroll to.
   * @param fraction The fraction of visible height (0.25 = 1/4 from top).
   */
  _scrollToPositionAtFraction(editor, bufferRow, fraction) {
    const editorView = atom.views.getView(editor);
    if(!editorView) {
      return;
    }
    const visibleHeight = editorView.getHeight();
    // Use pixelPositionForScreenPosition which accounts for block decorations (view zones)
    const screenPosition = editor.screenPositionForBufferPosition([bufferRow, 0]);
    const targetPixelPosition = editorView.pixelPositionForScreenPosition(screenPosition).top;
    const scrollTop = targetPixelPosition - (visibleHeight * fraction);
    editorView.setScrollTop(Math.max(0, scrollTop));
  }

  /**
   * Gets the index of a chunk by the line number.
   * @param editorIndex The index of the editor to check.
   * @param lineNumber  The line number to use to check if it is in a chunk.
   * @return The index of the chunk.
   */
  _getChunkIndexByLineNumber(editorIndex, lineNumber) {
    for(var i=0; i<this._chunks.length; i++) {
      var diffChunk = this._chunks[i];
      if(editorIndex === 1) {
        if(diffChunk.oldLineStart <= lineNumber && diffChunk.oldLineEnd > lineNumber) {
          return i;
        }
      } else if(editorIndex === 2) {
        if(diffChunk.newLineStart <= lineNumber && diffChunk.newLineEnd > lineNumber) {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * Highlights the word diff of the chunk passed in.
   *
   * @param chunk The chunk that should have its words highlighted.
   */
  _highlightWordsInChunk(chunk, leftHighlightType, rightHighlightType, isWhitespaceIgnored) {
    var leftLineNumber = chunk.oldLineStart;
    var rightLineNumber = chunk.newLineStart;
    // for each line that has a corresponding line
    while(leftLineNumber < chunk.oldLineEnd && rightLineNumber < chunk.newLineEnd) {
      var editor1LineText = this._editorDiffExtender1.getEditor().lineTextForBufferRow(leftLineNumber);
      var editor2LineText = this._editorDiffExtender2.getEditor().lineTextForBufferRow(rightLineNumber);

      if(editor1LineText == '') {
        // computeWordDiff returns empty for lines that are paired with empty lines
        // need to force a highlight
        this._editorDiffExtender2.setWordHighlights(rightLineNumber, [{changed: true, value: editor2LineText}], rightHighlightType, isWhitespaceIgnored);
      } else if( editor2LineText == '' ) {
        // computeWordDiff returns empty for lines that are paired with empty lines
        // need to force a highlight
        this._editorDiffExtender1.setWordHighlights(leftLineNumber, [{changed: true, value: editor1LineText}], leftHighlightType, isWhitespaceIgnored);
      } else {
        // perform regular word diff
        var wordDiff = ComputeWordDiff.computeWordDiff(editor1LineText, editor2LineText);
        this._editorDiffExtender1.setWordHighlights(leftLineNumber, wordDiff.removedWords, leftHighlightType, isWhitespaceIgnored);
        this._editorDiffExtender2.setWordHighlights(rightLineNumber, wordDiff.addedWords, rightHighlightType, isWhitespaceIgnored);
      }

      leftLineNumber++;
      rightLineNumber++;
    }

    // highlight remaining lines in left editor
    while(leftLineNumber < chunk.oldLineEnd) {
      var editor1LineText = this._editorDiffExtender1.getEditor().lineTextForBufferRow(leftLineNumber);
      this._editorDiffExtender1.setWordHighlights(leftLineNumber, [{changed: true, value: editor1LineText}], leftHighlightType, isWhitespaceIgnored);
      leftLineNumber++;
    }
    // highlight remaining lines in the right editor
    while(rightLineNumber < chunk.newLineEnd) {
      this._editorDiffExtender2.setWordHighlights(rightLineNumber, [{changed: true, value: this._editorDiffExtender2.getEditor().lineTextForBufferRow(rightLineNumber)}], rightHighlightType, isWhitespaceIgnored);
      rightLineNumber++;
    }
  }
};
