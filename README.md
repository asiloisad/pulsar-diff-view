# diff-view

A split pane diff tool. Compare files side-by-side with synchronized scrolling, soft-wrap support, git integration, and context menus.

![view](https://github.com/asiloisad-pulsar/diff-view/blob/master/assets/view.png?raw=true)

Fork of [split-diff](https://github.com/mupchrch/split-diff).

## Features

- **Soft-wrap support**: Diff works correctly with soft-wrap enabled, including proper line offsets and scroll synchronization.
- **Buffer-based scroll sync**: Uses buffer line positions for proper alignment across different soft-wrap settings.
- **Quick toggle buttons**: Footer buttons for soft-wrap toggle and equalizing pane widths.
- **Context menus**: Right-click on tree-view files or tabs to "Diff with Active File".
- **Scrollbar markers**: Shows diff markers in the scrollbar, via [scrollmap](https://github.com/asiloisad-pulsar/scrollmap).
- **Scroll compatibility**: View zone alignment correctly resyncs after soft-wrap recalculation on pane resize, via [scroll-keeper](https://github.com/asiloisad-pulsar/scroll-keeper).
- **Modern codebase**: Converted to JavaScript with updated dependencies.

## Installation

To install `diff-view` search for [diff-view](https://web.pulsar-edit.dev/packages/diff-view) in the Install pane of the Pulsar settings or run `ppm install diff-view`. Alternatively, you can run `ppm install asiloisad/pulsar-diff-view` to install a package directly from the GitHub repository.

## Commands

Commands available in `atom-workspace`:

- `diff-view:enable`: start a diff between two panes,
- `diff-view:toggle`: toggle diff on/off,
- `diff-view:disable`: stop the current diff,
- `diff-view:close`: stop diff and close the extra pane,
- `diff-view:next-diff`: jump to next difference,
- `diff-view:prev-diff`: jump to previous difference,
- `diff-view:copy-to-right`: copy current diff chunk to right editor,
- `diff-view:copy-to-left`: copy current diff chunk to left editor,
- `diff-view:git-head`: diff active file with git HEAD,
- `diff-view:git-commit`: diff active file with previous commit,
- `diff-view:toggle-soft-wrap`: toggle soft wrap during diff,
- `diff-view:equalize-widths`: equalize pane widths,
- `diff-view:toggle-center-line`: toggle center line indicator,
- `diff-view:set-ignore-whitespace`: toggle ignore whitespace,
- `diff-view:set-auto-diff`: toggle auto diff.

## Provided Service `diff-view`

Allows other packages to programmatically start, control, and inspect diffs.

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

- `getMarkerLayers()`: returns a `Promise` that resolves to an object containing the marker layers of each editor being diffed.
- `diffEditors(editor1, editor2, options)`: enables diff-view between the two given editors. `options` overrides any package setting.
- `disable()`: disables diff-view.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
