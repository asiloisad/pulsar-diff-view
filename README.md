# diff-view

Compare files side-by-side with synchronized scrolling. A split pane diff tool with soft-wrap support, git integration, and context menus.

Fork of [split-diff](https://github.com/mupchrch/split-diff).

## Features

- **Soft-wrap support**: Diff works correctly with soft-wrap enabled, including proper line offsets and scroll synchronization.
- **Buffer-based scroll sync**: Uses buffer line positions for proper alignment across different soft-wrap settings.
- **Quick toggle buttons**: Footer buttons for soft-wrap toggle and equalizing pane widths.
- **Context menus**: Right-click on tree-view files or tabs to "Diff with Active File".
- **Scrollmap**: Shows diff markers in the scrollbar via [scrollmap](https://github.com/asiloisad/pulsar-scrollmap).
- **Modern codebase**: Converted to JavaScript with updated dependencies.

## Installation

To install `diff-view` search for [diff-view](https://web.pulsar-edit.dev/packages/diff-view) in the Install pane of the Pulsar settings or run `ppm install diff-view`. Alternatively, you can run `ppm install asiloisad/pulsar-diff-view` to install a package directly from the GitHub repository.

## Service

The package provides a `diff-view` service for other packages.

In your `package.json`:

```json
{
  "consumedServices": {
    "diff-view": {
      "versions": {
        "1.0.0": "consumeDiffView"
      }
    }
  }
}
```

In your main module:

```javascript
module.exports = {
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
}
```

### Methods

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

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback's welcome!
