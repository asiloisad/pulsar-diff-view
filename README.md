# diff-view

A split pane diff tool for Pulsar. Diffs text between two split panes, with support for soft-wrap, scroll synchronization, and git changes.

- **Full soft-wrap support** - Diff now works correctly with soft-wrap enabled. Line offsets and scroll synchronization properly handle wrapped lines.
- **Buffer-based scroll sync** - Scroll synchronization uses buffer line positions instead of screen positions, ensuring proper alignment even when editors have different soft-wrap settings or window widths.
- **Soft-wrap toggle button** - New footer button to toggle soft-wrap on/off during diff.
- **Equalize widths button** - New footer button to equalize pane widths for easier comparison.
- **Tooltips for all buttons** - All footer buttons now show tooltips on hover.
- **Dock toggle button fix** - The dock toggle button no longer overlaps the diff footer bar.
- **Tree-view context menu** - Right-click on a file in tree-view to "Diff with Active File".
- **Tab context menu** - Right-click on a tab to "Diff with Active File".
- **scroll-map integration** - Integrates with the scroll-map package to show diff markers in the scrollbar minimap.
- **Converted to JavaScript** - All CoffeeScript files have been converted to modern JavaScript.

## Installation

To install `diff-view` search for [diff-view](https://web.pulsar-edit.dev/packages/diff-view) in the Install pane of the Pulsar settings or run `ppm install diff-view`. Alternatively, you can run `ppm install asiloisad/pulsar-diff-view` to install a package directly from the GitHub repository.

### Service API

Packages can consume the diff-view service to programmatically control diffs.

```js
// In your package.json:
"consumedServices": {
  "diff-view": {
    "versions": {
      "1.0.0": "consumeDiffView"
    }
  }
}

// In your package:
consumeDiffView(diffViewService) {
  // Get marker layers for the current diff
  diffViewService.getMarkerLayers().then((layers) => {
    // layers.editor1MarkerLayer, layers.editor2MarkerLayer
  });

  // Start a diff between two editors
  diffViewService.diffEditors(editor1, editor2, {
    ignoreWhitespace: true,
    autoDiff: false
  });

  // Disable the current diff
  diffViewService.disable();
}
```

#### Service Methods

```js
/**
 * Getter for the marker layers of each editor being diffed.
 * @return {Promise} A promise that resolves to an object containing the marker layers.
 */
getMarkerLayers();

/**
 * Enables diff-view between the two given editors.
 * @param {TextEditor} editor1 - The left editor.
 * @param {TextEditor} editor2 - The right editor.
 * @param {object} options - Options to override any package setting.
 */
diffEditors(editor1, editor2, options);

/**
 * Disables diff-view.
 */
disable();
```

# Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback’s welcome!

# Credits

Fork of [split-diff](https://github.com/mupchrch/split-diff).
