'use babel'

module.exports = class EditorDiffExtender {
  _destroyed = false;

  constructor(editor) {
    this._editor = editor;
    this._lineMarkerLayer = this._editor.addMarkerLayer();
    this._miscMarkers = [];
    this._blockDecorations = []; // Store block decoration objects for proper cleanup
    this._selectionMarkerLayer = this._editor.addMarkerLayer();
    this._offsetDecorations = []; // Store offset decoration info for dynamic updates
    this._staticLineOffsets = {}; // Store static offset info (not rendered, used for reference)
    this._oldPlaceholderText = editor.getPlaceholderText();
    editor.setPlaceholderText('Paste what you want to diff here!');
    // add diff-view css selector to editors for keybindings #73
    atom.views.getView(this._editor).classList.add('diff-view');
  }

  /**
   * Adds offsets (blank lines) into the editor.
   *
   * Note: Static line-count-based offsets are no longer created here.
   * The dynamic view zone system in DiffDisplay._syncViewZoneHeights()
   * handles all height compensation, including accounting for soft-wrap.
   * This ensures correct alignment when lines wrap to different heights.
   *
   * @param lineOffsets An array of offsets (blank lines) - stored for reference but not rendered.
   */
  setLineOffsets(lineOffsets) {
    // Store offsets for reference but don't create decorations.
    // The dynamic view zone system handles height compensation.
    this._staticLineOffsets = lineOffsets;
  }

  /**
   * Creates marker for line highlight.
   *
   * @param startIndex The start index of the line chunk to highlight.
   * @param endIndex The end index of the line chunk to highlight.
   * @param highlightType The type of highlight to be applied to the line.
   */
  highlightLines(startIndex, endIndex, highlightType) {
    if(startIndex != endIndex) {
      var highlightClass = 'diff-view-line diff-view-' + highlightType;
      this._createLineMarker(this._lineMarkerLayer, startIndex, endIndex, highlightClass);
    }
  }

  /**
   * The line marker layer holds all added/removed line markers.
   *
   * @return The line marker layer.
   */
  getLineMarkerLayer() {
    return this._lineMarkerLayer;
  }

  /**
   * The selection marker layer holds all line highlight selection markers.
   *
   * @return The selection marker layer.
   */
  getSelectionMarkerLayer() {
    return this._selectionMarkerLayer;
  }

  /**
   * Highlights words in a given line.
   *
   * @param lineNumber The line number to highlight words on.
   * @param wordDiff An array of objects which look like...
   *    added: boolean (not used)
   *    count: number (not used)
   *    removed: boolean (not used)
   *    value: string
   *    changed: boolean
   * @param type The type of highlight to be applied to the words.
   */
  setWordHighlights(lineNumber, wordDiff = [], type, isWhitespaceIgnored) {
    var klass = 'diff-view-word-' + type;
    var count = 0;

    for(var i=0; i<wordDiff.length; i++) {
      if(wordDiff[i].value) { // fix for #49
        // if there was a change
        // AND one of these is true:
        // if the string is not spaces, highlight
        // OR
        // if the string is spaces and whitespace not ignored, highlight
        if(wordDiff[i].changed
          && (/\S/.test(wordDiff[i].value)
          || (!/\S/.test(wordDiff[i].value) && !isWhitespaceIgnored))) {
          var marker = this._editor.markBufferRange([[lineNumber, count], [lineNumber, (count + wordDiff[i].value.length)]], {invalidate: 'never'})
          this._editor.decorateMarker(marker, {type: 'highlight', class: klass});
          this._miscMarkers.push(marker);
        }
        count += wordDiff[i].value.length;
      }
    }
  }

  /**
   * Destroys all markers added to this editor by diff-view.
   */
  destroyMarkers() {
    // Note: Don't check _destroyed here - this is called from destroy() after flag is set

    // Clear references immediately to prevent race conditions
    var blockDecorations = this._blockDecorations;
    var miscMarkers = this._miscMarkers;
    this._blockDecorations = [];
    this._miscMarkers = [];
    this._offsetDecorations = [];

    // Defer destruction to avoid race conditions with Pulsar's render cycle
    requestAnimationFrame(() => {
      // Destroy block decorations first, then markers
      blockDecorations.forEach(function(decoration) {
        try {
          if (decoration) decoration.destroy();
        } catch (e) { /* decoration may be invalid if editor is destroyed */ }
      });

      miscMarkers.forEach(function(marker) {
        try {
          marker.destroy();
        } catch (e) { /* marker may be invalid if editor is destroyed */ }
      });
    });

    // Safely clear marker layers (may fail if editor is destroyed)
    try {
      this._lineMarkerLayer.clear();
    } catch (e) { /* editor may be destroyed */ }
    try {
      this._selectionMarkerLayer.clear();
    } catch (e) { /* editor may be destroyed */ }
  }

  /**
   * Destroys the instance of the EditorDiffExtender and cleans up after itself.
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    this.destroyMarkers();

    // Safely destroy marker layer (may fail if editor is already destroyed)
    try {
      this._lineMarkerLayer.destroy();
    } catch (e) { /* editor may be destroyed */ }

    // Only restore placeholder and remove CSS if editor still exists
    try {
      if (this._editor && !this._editor.isDestroyed()) {
        this._editor.setPlaceholderText(this._oldPlaceholderText);
        var editorView = atom.views.getView(this._editor);
        if (editorView) {
          editorView.classList.remove('diff-view');
        }
      }
    } catch (e) { /* editor may be destroyed */ }
  }

  /**
   * Selects lines.
   *
   * @param startLine The line number that the selection starts at.
   * @param endLine The line number that the selection ends at (non-inclusive).
   */
  selectLines(startLine, endLine) {
    // don't want to highlight if they are the same (same numbers means chunk is
    // just pointing to a location to copy-to-right/copy-to-left)
    if(startLine < endLine) {
      var selectionMarker = this._selectionMarkerLayer.findMarkers({
        startBufferRow: startLine,
        endBufferRow: endLine
      })[0];
      if(!selectionMarker) {
        this._createLineMarker(this._selectionMarkerLayer, startLine, endLine, 'diff-view-selected');
      }
    }
  }

  deselectLines(startLine, endLine) {
    var selectionMarker = this._selectionMarkerLayer.findMarkers({
      startBufferRow: startLine,
      endBufferRow: endLine
    })[0];
    if(selectionMarker) {
      selectionMarker.destroy();
    }
  }

  /**
   * Destroy the selection markers.
   */
  deselectAllLines() {
    this._selectionMarkerLayer.clear();
  }

  /**
   * Used to test whether there is currently an active selection highlight in
   * the editor.
   *
   * @return A boolean signifying whether there is an active selection highlight.
   */
  hasSelection() {
    if(this._selectionMarkerLayer.getMarkerCount() > 0) {
      return true;
    }
    return false;
  }

  /**
   * Enable soft wrap for this editor.
   */
  enableSoftWrap() {
    try {
      this._editor.setSoftWrapped(true);
    } catch (e) {
      //console.log('Soft wrap was enabled on a text editor that does not exist.');
    }
  }

  /**
   * Removes the text editor without prompting a save.
   */
  cleanUp() {
    // if the pane that this editor was in is now empty, we will destroy it
    var editorPane = atom.workspace.paneForItem(this._editor);
    if(typeof editorPane !== 'undefined' && editorPane != null && editorPane.getItems().length == 1) {
      editorPane.destroy();
    } else {
      this._editor.destroy();
    }
  }

  /**
   * Used to get the Text Editor object for this view. Helpful for calling basic
   * Atom Text Editor functions.
   *
   * @return The Text Editor object for this view.
   */
  getEditor() {
    return this._editor;
  }

  // ----------------------------------------------------------------------- //
  // --------------------------- PRIVATE METHODS --------------------------- //
  // ----------------------------------------------------------------------- //

  /**
   * Creates a marker and decorates its line and line number.
   *
   * @param markerLayer The marker layer to put the marker in.
   * @param startLineNumber A buffer line number to start highlighting at.
   * @param endLineNumber A buffer line number to end highlighting at.
   * @param highlightClass The type of highlight to be applied to the line.
   *    Could be a value of: ['diff-view-insert', 'diff-view-delete',
   *    'diff-view-select'].
   * @return The created line marker.
   */
  _createLineMarker(markerLayer, startLineNumber, endLineNumber, highlightClass) {
    var marker = markerLayer.markBufferRange([[startLineNumber, 0], [endLineNumber, 0]], {invalidate: 'never'})

    this._editor.decorateMarker(marker, {type: 'line-number', class: highlightClass});
    this._editor.decorateMarker(marker, {type: 'line', class: highlightClass});

    return marker;
  }

  /**
   * Creates a decoration for an offset.
   *
   * @param lineNumber The line number to add the block decoration to.
   * @param numberOfLines The number of lines that the block decoration's height will be.
   * @param blockPosition Specifies whether to put the decoration before the line or after.
   */
  _addOffsetDecoration(lineNumber, numberOfLines, blockPosition) {
    var element = document.createElement('div');
    element.className += 'diff-view-offset';
    // if no text, set height for blank lines
    var height = numberOfLines * this._editor.getLineHeightInPixels();
    element.style.minHeight = height + 'px';

    // Mark at the END of the line content so the view zone appears
    // after the last screen row of a wrapped line, not after the first.
    // This matches setViewZoneHeight behavior for consistency.
    var lineLength = lineNumber >= 0 ? this._editor.lineTextForBufferRow(lineNumber).length : 0;
    var marker = this._editor.markBufferPosition([Math.max(0, lineNumber), lineLength], {invalidate: 'never'});
    var decoration = this._editor.decorateMarker(marker, {type: 'block', position: blockPosition, item: element});
    this._miscMarkers.push(marker);
    this._blockDecorations.push(decoration);

    // Store decoration info for potential dynamic updates (soft-wrap support)
    this._offsetDecorations.push({
      element: element,
      lineNumber: lineNumber,
      numberOfLines: numberOfLines,
      blockPosition: blockPosition,
      marker: marker
    });
  }

  /**
   * Updates all offset decoration heights.
   * Called when editor width changes or soft-wrap settings change.
   */
  updateOffsetHeights() {
    var lineHeight = this._editor.getLineHeightInPixels();
    this._offsetDecorations.forEach(function(decoration) {
      var height = decoration.numberOfLines * lineHeight;
      decoration.element.style.minHeight = height + 'px';
    });
  }

  /**
   * Gets the pixel height of a single buffer line, accounting for soft-wrap.
   * When soft-wrap is enabled, a single buffer line may span multiple screen rows.
   *
   * @param bufferRow The buffer row to get the height for.
   * @return The height in pixels.
   */
  getWrappedLineHeight(bufferRow) {
    var firstScreenRow = this._editor.screenRowForBufferRow(bufferRow);
    var nextBufferRow = Math.min(bufferRow + 1, this._editor.getLastBufferRow());
    var nextScreenRow = this._editor.screenRowForBufferRow(nextBufferRow);

    // Handle last line edge case
    var screenRowCount;
    if (bufferRow === this._editor.getLastBufferRow()) {
      screenRowCount = this._editor.getLastScreenRow() - firstScreenRow + 1;
    } else {
      screenRowCount = nextScreenRow - firstScreenRow;
    }

    return screenRowCount * this._editor.getLineHeightInPixels();
  }

  /**
   * Gets the total pixel height of a range of buffer lines, accounting for soft-wrap.
   *
   * @param startRow The starting buffer row (inclusive).
   * @param endRow The ending buffer row (exclusive).
   * @return The total height in pixels.
   */
  getBufferRangeHeight(startRow, endRow) {
    if (startRow >= endRow) {
      return 0;
    }

    var startScreenRow = this._editor.screenRowForBufferRow(startRow);
    var endScreenRow = this._editor.screenRowForBufferRow(endRow);
    var screenRowCount = endScreenRow - startScreenRow;

    return screenRowCount * this._editor.getLineHeightInPixels();
  }

  /**
   * Updates a view zone (offset decoration) at a specific line to a specific pixel height.
   * Creates the view zone if it doesn't exist.
   *
   * @param lineNumber The buffer line number where the view zone should be placed.
   * @param heightInPixels The height in pixels for the view zone.
   * @param blockPosition 'before' or 'after' the line. Defaults to 'after'.
   */
  setViewZoneHeight(lineNumber, heightInPixels, blockPosition = 'after') {
    // Find existing view zone at this line
    var existingDecoration = this._offsetDecorations.find(function(d) {
      return d.lineNumber === lineNumber && d.blockPosition === blockPosition;
    });

    if (existingDecoration) {
      // Update existing view zone height
      existingDecoration.element.style.minHeight = heightInPixels + 'px';
      existingDecoration.pixelHeight = heightInPixels;
    } else if (heightInPixels > 0) {
      // Create new view zone
      var element = document.createElement('div');
      element.className = 'diff-view-offset';
      element.style.minHeight = heightInPixels + 'px';

      // Mark at the END of the line content so the view zone appears
      // after the last screen row of a wrapped line, not after the first
      var lineLength = this._editor.lineTextForBufferRow(lineNumber).length;
      var marker = this._editor.markBufferPosition([lineNumber, lineLength], {invalidate: 'never'});
      var decoration = this._editor.decorateMarker(marker, {type: 'block', position: blockPosition, item: element});
      this._miscMarkers.push(marker);
      this._blockDecorations.push(decoration);

      this._offsetDecorations.push({
        element: element,
        lineNumber: lineNumber,
        numberOfLines: 0, // Not used for dynamic view zones
        pixelHeight: heightInPixels,
        blockPosition: blockPosition,
        marker: marker,
        decoration: decoration
      });
    }
  }

  /**
   * Removes a view zone at a specific line.
   *
   * @param lineNumber The buffer line number of the view zone to remove.
   * @param blockPosition 'before' or 'after' the line.
   */
  removeViewZone(lineNumber, blockPosition = 'after') {
    var index = this._offsetDecorations.findIndex(function(d) {
      return d.lineNumber === lineNumber && d.blockPosition === blockPosition;
    });

    if (index !== -1) {
      var decoration = this._offsetDecorations[index];
      try {
        if (decoration.decoration) {
          decoration.decoration.destroy();
        }
        if (decoration.marker) {
          decoration.marker.destroy();
        }
      } catch (e) { /* ignore */ }

      this._offsetDecorations.splice(index, 1);
    }
  }

  /**
   * Clears all dynamic view zones (those with pixelHeight property).
   */
  clearDynamicViewZones() {
    var toRemove = this._offsetDecorations.filter(function(d) {
      return d.pixelHeight !== undefined;
    });

    toRemove.forEach((decoration) => {
      this.removeViewZone(decoration.lineNumber, decoration.blockPosition);
    });
  }

  /**
   * Gets the offset decorations for external access (e.g., for cross-editor height sync).
   * @return Array of offset decoration info objects.
   */
  getOffsetDecorations() {
    return this._offsetDecorations;
  }
};
