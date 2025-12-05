'use strict';

const { CompositeDisposable, File } = require('atom');
const DiffView = require('./diff-display');
const FooterView = require('./footer-view');
const SyncScroll = require('./sync-scroll');
const StyleCalculator = require('./style-calculator');
const path = require('path');

module.exports = {
  diffView: null,
  subscriptions: null,
  editorSubscriptions: null,
  lineEndingSubscription: null,
  contextMenuSubscriptions: null,
  isEnabled: false,
  wasEditor1Created: false,
  wasEditor2Created: false,
  wasEditor1SoftWrapped: false,
  wasEditor2SoftWrapped: false,
  hasGitRepo: false,
  docksToReopen: { left: false, right: false, bottom: false },
  process: null,
  splitDiffResolves: [],
  options: {},

  activate(state) {
    this.contextForService = this;

    const styleCalculator = new StyleCalculator(atom.styles, atom.config);
    styleCalculator.startWatching(
      'diff-view-custom-styles',
      ['diff-view.addedColor', 'diff-view.removedColor'],
      (config) => {
        const addedColor = config.get('diff-view.addedColor');
        addedColor.alpha = 0.4;
        const addedWordColor = addedColor;
        addedWordColor.alpha = 0.5;
        const removedColor = config.get('diff-view.removedColor');
        removedColor.alpha = 0.4;
        const removedWordColor = removedColor;
        removedWordColor.alpha = 0.5;
        return `
.diff-view-added-custom {
  background-color: ${addedColor.toRGBAString()};
}
.diff-view-removed-custom {
  background-color: ${removedColor.toRGBAString()};
}
.diff-view-word-added-custom .region {
  background-color: ${addedWordColor.toRGBAString()};
}
.diff-view-word-removed-custom .region {
  background-color: ${removedWordColor.toRGBAString()};
}`;
      }
    );

    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(atom.commands.add('atom-workspace, .tree-view .selected, .tab.texteditor', {
      'diff-view:enable': (e) => {
        this.diffPanes(e);
        e.stopPropagation();
      },
      'diff-view:next-diff': () => {
        if (this.isEnabled) {
          this.nextDiff();
        } else {
          this.diffPanes();
        }
      },
      'diff-view:prev-diff': () => {
        if (this.isEnabled) {
          this.prevDiff();
        } else {
          this.diffPanes();
        }
      },
      'diff-view:copy-to-right': () => {
        if (this.isEnabled) {
          this.copyToRight();
        }
      },
      'diff-view:copy-to-left': () => {
        if (this.isEnabled) {
          this.copyToLeft();
        }
      },
      'diff-view:disable': () => this.disable(),
      'diff-view:set-ignore-whitespace': () => this.toggleIgnoreWhitespace(),
      'diff-view:set-auto-diff': () => this.toggleAutoDiff(),
      'diff-view:toggle': () => this.toggle(),
      'diff-view:toggle-soft-wrap': () => this.toggleSoftWrap(),
      'diff-view:equalize-widths': () => this.equalizeWidths(),
      'diff-view:git-head': (e) => {
        this.diffGit(e);
        if (e) e.stopPropagation();
      },
      'diff-view:git-commit': (e) => {
        this.diffGit(e, 'HEAD~1');
        if (e) e.stopPropagation();
      },
      'diff-view:toggle-center-line': () => this.toggleCenterLine()
    }));
  },

  deactivate() {
    this.disable();
    this.subscriptions.dispose();
  },

  // called by "toggle" command
  // toggles split diff
  toggle() {
    if (this.isEnabled) {
      this.disable();
    } else {
      this.diffPanes();
    }
  },

  // called by "diff-git" command
  // diffs the file against its git version (HEAD by default, or specified ref)
  diffGit(event, ref = 'HEAD') {
    let filePath = null;

    // Get file path from event target (tree-view or tab)
    if (event && event.currentTarget) {
      const target = event.currentTarget;

      // Check if it's a tab
      if (target.classList.contains('tab')) {
        const elemWithPath = target.querySelector('[data-path]');
        if (elemWithPath) {
          filePath = elemWithPath.dataset.path;
        } else if (target.item && target.item.getPath) {
          filePath = target.item.getPath();
        }
      }
      // Check if it's a tree-view file item
      else if (target.classList.contains('file') || target.classList.contains('selected')) {
        let elemWithPath = target.querySelector('[data-path]');
        if (!elemWithPath && target.dataset && target.dataset.path) {
          filePath = target.dataset.path;
        } else if (elemWithPath) {
          filePath = elemWithPath.dataset.path;
        }
        if (!filePath) {
          const nameSpan = target.querySelector('span.name[data-path]');
          if (nameSpan) {
            filePath = nameSpan.dataset.path;
          }
        }
      }
      // Check if it's a text editor
      else if (target.classList.contains('editor') || target.tagName === 'ATOM-TEXT-EDITOR') {
        const editor = atom.workspace.getActiveTextEditor();
        if (editor) {
          filePath = editor.getPath();
        }
      }
    }

    // Fallback to active editor if no file path found
    if (!filePath) {
      const activeEditor = atom.workspace.getActiveTextEditor();
      if (activeEditor) {
        filePath = activeEditor.getPath();
      }
    }

    if (!filePath) {
      atom.notifications.addWarning('Diff View', { detail: 'No file found to diff', dismissable: false, icon: 'diff' });
      return;
    }

    // Find the git repository and get the ref version
    const directories = atom.project.getDirectories();
    for (let i = 0; i < directories.length; i++) {
      const directory = directories[i];
      if (filePath === directory.getPath() || directory.contains(filePath)) {
        let projectRepo = atom.project.getRepositories()[i];
        if (projectRepo != null) {
          projectRepo = projectRepo.getRepo(filePath);
          const relativeFilePath = projectRepo.relativize(filePath);

          // For HEAD, use getHeadBlob; for other refs, use git show
          if (ref === 'HEAD') {
            const gitText = projectRepo.getHeadBlob(relativeFilePath);
            if (gitText != null) {
              this.disable();
              const editorsPromise = this._getEditorsForGitDiff(filePath, gitText);
              this.diffPanes(null, editorsPromise);
              return;
            } else {
              atom.notifications.addWarning('Diff View', { detail: 'No git HEAD version found for this file', dismissable: false, icon: 'diff' });
              return;
            }
          } else {
            // Use git show for other refs
            const { spawnSync } = require('child_process');
            const repoPath = projectRepo.getWorkingDirectory();
            const result = spawnSync('git', ['show', `${ref}:${relativeFilePath}`], {
              cwd: repoPath,
              encoding: 'utf8',
              maxBuffer: 10 * 1024 * 1024
            });

            if (result.status === 0 && result.stdout) {
              this.disable();
              const editorsPromise = this._getEditorsForGitDiff(filePath, result.stdout);
              this.diffPanes(null, editorsPromise);
              return;
            } else {
              atom.notifications.addWarning('Diff View', { detail: `No ${ref} version found for this file`, dismissable: false, icon: 'diff' });
              return;
            }
          }
        }
      }
    }

    atom.notifications.addWarning('Diff View', { detail: 'File is not in a git repository', dismissable: false, icon: 'diff' });
  },

  // Gets editors for git diff - current file on left, HEAD on right
  _getEditorsForGitDiff(filePath, gitHeadText) {
    return atom.workspace.open(filePath, { split: 'left' }).then((editor1) => {
      const editor2 = atom.workspace.buildTextEditor({ autoHeight: false });
      this.wasEditor2Created = true;

      // Normalize line endings to match editor1
      const BufferExtender = require('./buffer-extender');
      const buffer1LineEnding = new BufferExtender(editor1.getBuffer()).getLineEnding();
      if (buffer1LineEnding) {
        editor2.getBuffer().setPreferredLineEnding(buffer1LineEnding);
        // Normalize git HEAD text line endings
        const normalizedText = gitHeadText.replace(/\r\n|\r|\n/g, buffer1LineEnding);
        editor2.setText(normalizedText);
      } else {
        editor2.setText(gitHeadText);
      }

      // Set grammar to match the original file (after text is set)
      const grammar = editor1.getGrammar();
      if (grammar && grammar.scopeName) {
        atom.grammars.assignLanguageMode(editor2.getBuffer(), grammar.scopeName);
      }

      // Add to pane to the right
      const panes = atom.workspace.getCenter().getPanes();
      const rightPaneIndex = panes.indexOf(atom.workspace.paneForItem(editor1)) + 1;
      const rightPane = panes[rightPaneIndex] || atom.workspace.paneForItem(editor1).splitRight();
      rightPane.addItem(editor2);
      rightPane.activateItem(editor2);

      return { editor1: editor1, editor2: editor2 };
    });
  },

  // called by "Disable" command
  // removes diff and sync scroll, disposes of subscriptions
  disable() {
    this.isEnabled = false;

    // remove listeners
    if (this.editorSubscriptions != null) {
      this.editorSubscriptions.dispose();
      this.editorSubscriptions = null;
    }
    if (this.contextMenuSubscriptions != null) {
      this.contextMenuSubscriptions.dispose();
      this.contextMenuSubscriptions = null;
    }
    if (this.lineEndingSubscription != null) {
      this.lineEndingSubscription.dispose();
      this.lineEndingSubscription = null;
    }

    if (this.diffView != null) {
      // Remove center line class from editors before cleanup
      const editor1 = this.diffView._editorDiffExtender1 != null ? this.diffView._editorDiffExtender1.getEditor() : null;
      const editor2 = this.diffView._editorDiffExtender2 != null ? this.diffView._editorDiffExtender2.getEditor() : null;
      if (editor1 != null) {
        atom.views.getView(editor1).classList.remove('show-center-line');
      }
      if (editor2 != null) {
        atom.views.getView(editor2).classList.remove('show-center-line');
      }

      if (this.wasEditor1Created) {
        this.diffView.cleanUpEditor(1);
      } else if (this.wasEditor1SoftWrapped) {
        this.diffView.restoreEditorSoftWrap(1);
      }
      if (this.wasEditor2Created) {
        this.diffView.cleanUpEditor(2);
      } else if (this.wasEditor2SoftWrapped) {
        this.diffView.restoreEditorSoftWrap(2);
      }
      this.diffView.destroy();
      this.diffView = null;
    }

    // remove views
    if (this.footerView != null) {
      this.footerView.destroy();
      this.footerView = null;
    }

    if (this.syncScroll != null) {
      this.syncScroll.dispose();
      this.syncScroll = null;
    }

    // auto hide tree view while diffing #82
    const hideDocks = this.options.hideDocks != null ? this.options.hideDocks : this._getConfig('hideDocks');
    if (hideDocks) {
      if (this.docksToReopen.left) {
        atom.workspace.getLeftDock().show();
      }
      if (this.docksToReopen.right) {
        atom.workspace.getRightDock().show();
      }
      if (this.docksToReopen.bottom) {
        atom.workspace.getBottomDock().show();
      }
    }

    // reset all variables
    this.docksToReopen = { left: false, right: false, bottom: false };
    this.wasEditor1Created = false;
    this.wasEditor2Created = false;
    this.wasEditor1SoftWrapped = false;
    this.wasEditor2SoftWrapped = false;
    this.hasGitRepo = false;

    // Clear scroll-map layers
    this._updateScrollMapLayers();
  },

  // called by "ignore whitespace toggle" command
  toggleIgnoreWhitespace() {
    // if ignoreWhitespace is not being overridden
    if (this.options.ignoreWhitespace == null) {
      const ignoreWhitespace = this._getConfig('ignoreWhitespace');
      this._setConfig('ignoreWhitespace', !ignoreWhitespace);
      if (this.footerView != null) {
        this.footerView.setIgnoreWhitespace(!ignoreWhitespace);
      }
    }
  },

  // called by "auto diff toggle" command
  toggleAutoDiff() {
    // if autoDiff is not being overridden
    if (this.options.autoDiff == null) {
      const autoDiff = this._getConfig('autoDiff');
      this._setConfig('autoDiff', !autoDiff);
      if (this.footerView != null) {
        this.footerView.setAutoDiff(!autoDiff);
      }
    }
  },

  // called by "toggle soft-wrap" command
  toggleSoftWrap() {
    if (this.isEnabled && this.diffView != null) {
      const editor1 = this.diffView._editorDiffExtender1 != null ? this.diffView._editorDiffExtender1.getEditor() : null;
      const editor2 = this.diffView._editorDiffExtender2 != null ? this.diffView._editorDiffExtender2.getEditor() : null;
      if (editor1 != null || editor2 != null) {
        const isSoftWrapped = (editor1 != null && editor1.isSoftWrapped()) || (editor2 != null && editor2.isSoftWrapped());
        const newValue = !isSoftWrapped;
        if (editor1 != null) {
          editor1.setSoftWrapped(newValue);
        }
        if (editor2 != null) {
          editor2.setSoftWrapped(newValue);
        }
        if (this.footerView != null) {
          this.footerView.setSoftWrap(newValue);
        }
      }
    }
  },

  // called by "equalize widths" command
  equalizeWidths() {
    if (this.isEnabled && this.diffView != null) {
      const editor1 = this.diffView._editorDiffExtender1 != null ? this.diffView._editorDiffExtender1.getEditor() : null;
      const editor2 = this.diffView._editorDiffExtender2 != null ? this.diffView._editorDiffExtender2.getEditor() : null;
      if (editor1 != null && editor2 != null) {
        const pane1 = atom.workspace.paneForItem(editor1);
        const pane2 = atom.workspace.paneForItem(editor2);
        if (pane1 != null && pane2 != null) {
          // Set equal flex grow for both panes
          const pane1View = atom.views.getView(pane1);
          const pane2View = atom.views.getView(pane2);
          if (pane1View != null && pane2View != null) {
            pane1View.style.flexGrow = '1';
            pane2View.style.flexGrow = '1';
          }
        }
      }
    }
  },

  // called by "toggle center line" command
  toggleCenterLine() {
    if (this.isEnabled && this.diffView != null) {
      const editor1 = this.diffView._editorDiffExtender1 != null ? this.diffView._editorDiffExtender1.getEditor() : null;
      const editor2 = this.diffView._editorDiffExtender2 != null ? this.diffView._editorDiffExtender2.getEditor() : null;
      if (editor1 != null || editor2 != null) {
        const editorView1 = editor1 != null ? atom.views.getView(editor1) : null;
        const editorView2 = editor2 != null ? atom.views.getView(editor2) : null;
        const isEnabled = (editorView1 != null && editorView1.classList.contains('show-center-line')) ||
                         (editorView2 != null && editorView2.classList.contains('show-center-line'));
        const newValue = !isEnabled;
        if (editorView1 != null) {
          editorView1.classList.toggle('show-center-line', newValue);
        }
        if (editorView2 != null) {
          editorView2.classList.toggle('show-center-line', newValue);
        }
        if (this.footerView != null) {
          this.footerView.setCenterLine(newValue);
        }
      }
    }
  },

  // called by "Move to next diff" command
  nextDiff() {
    if (this.diffView != null) {
      let isSyncScrollEnabled = false;
      const scrollSyncType = this.options.scrollSyncType != null ? this.options.scrollSyncType : this._getConfig('scrollSyncType');
      if (scrollSyncType === 'Vertical + Horizontal' || scrollSyncType === 'Vertical') {
        isSyncScrollEnabled = true;
      }
      const selectedIndex = this.diffView.nextDiff(isSyncScrollEnabled);
      if (this.footerView != null) {
        this.footerView.showSelectionCount(selectedIndex + 1);
      }
    }
  },

  // called by "Move to previous diff" command
  prevDiff() {
    if (this.diffView != null) {
      let isSyncScrollEnabled = false;
      const scrollSyncType = this.options.scrollSyncType != null ? this.options.scrollSyncType : this._getConfig('scrollSyncType');
      if (scrollSyncType === 'Vertical + Horizontal' || scrollSyncType === 'Vertical') {
        isSyncScrollEnabled = true;
      }
      const selectedIndex = this.diffView.prevDiff(isSyncScrollEnabled);
      if (this.footerView != null) {
        this.footerView.showSelectionCount(selectedIndex + 1);
      }
    }
  },

  // called by "Copy to right" command
  copyToRight() {
    if (this.diffView != null) {
      this.diffView.copyToRight();
      if (this.footerView != null) {
        this.footerView.hideSelectionCount();
      }
    }
  },

  // called by "Copy to left" command
  copyToLeft() {
    if (this.diffView != null) {
      this.diffView.copyToLeft();
      if (this.footerView != null) {
        this.footerView.hideSelectionCount();
      }
    }
  },

  // called by the commands enable/toggle to do initial diff
  // sets up subscriptions for auto diff and disabling when a pane is destroyed
  // event is an optional argument of a file path to diff with current
  // editorsPromise is an optional argument of a promise that returns with 2 editors
  // options is an optional argument with optional properties that are used to override user's settings
  diffPanes(event, editorsPromise, options = {}) {
    this.options = options;

    if (!editorsPromise) {
      const params = {};
      let hasFileTarget = false;

      if (event && event.currentTarget) {
        const target = event.currentTarget;

        // Check if it's a tab
        if (target.classList.contains('tab')) {
          hasFileTarget = true;
          const elemWithPath = target.querySelector('[data-path]');
          if (elemWithPath) {
            params.path = elemWithPath.dataset.path;
          } else if (target.item) {
            params.editor = target.item.copy();
          }
        }
        // Check if it's a tree-view file item
        else if (target.classList.contains('file') || target.classList.contains('selected')) {
          hasFileTarget = true;
          // Try to get path from data-path attribute on target or child
          let elemWithPath = target.querySelector('[data-path]');
          if (!elemWithPath && target.dataset && target.dataset.path) {
            params.path = target.dataset.path;
          } else if (elemWithPath) {
            params.path = elemWithPath.dataset.path;
          }
          // Also check for span.name with data-path
          if (!params.path) {
            const nameSpan = target.querySelector('span.name[data-path]');
            if (nameSpan) {
              params.path = nameSpan.dataset.path;
            }
          }
        }
      }

      if (hasFileTarget && params.path) {
        this.disable();
        editorsPromise = this._getEditorsForDiffWithActive(params);
      } else if (hasFileTarget && params.editor) {
        this.disable();
        editorsPromise = this._getEditorsForDiffWithActive(params);
      } else {
        this.disable();
        editorsPromise = this._getEditorsForQuickDiff();
      }
    } else {
      this.disable();
    }

    editorsPromise.then((editors) => {
      if (editors === null) {
        return;
      }
      this.editorSubscriptions = new CompositeDisposable();
      this._setupVisibleEditors(editors);
      this.diffView = new DiffView(editors);

      // add listeners
      this._setupEditorSubscriptions(editors);

      // add the bottom UI panel
      if (this.footerView == null) {
        const ignoreWhitespace = this.options.ignoreWhitespace != null ? this.options.ignoreWhitespace : this._getConfig('ignoreWhitespace');
        const autoDiff = this.options.autoDiff != null ? this.options.autoDiff : this._getConfig('autoDiff');
        const softWrapEnabled = (editors.editor1 != null && editors.editor1.isSoftWrapped()) || (editors.editor2 != null && editors.editor2.isSoftWrapped());
        this.footerView = new FooterView(ignoreWhitespace, this.options.ignoreWhitespace != null, autoDiff, this.options.autoDiff != null, softWrapEnabled);
        this.footerView.createPanel();
      }
      this.footerView.show();

      // auto hide tree view while diffing #82
      const hideDocks = this.options.hideDocks != null ? this.options.hideDocks : this._getConfig('hideDocks');
      if (hideDocks) {
        this.docksToReopen.left = atom.workspace.getLeftDock().isVisible();
        this.docksToReopen.right = atom.workspace.getRightDock().isVisible();
        this.docksToReopen.bottom = atom.workspace.getBottomDock().isVisible();
        atom.workspace.getLeftDock().hide();
        atom.workspace.getRightDock().hide();
        atom.workspace.getBottomDock().hide();
      }

      // update diff if there is no git repo (no onchange fired)
      if (!this.hasGitRepo) {
        this.updateDiff(editors);
      }

      // add context menu items for active diff (shows diff commands in editor context menu)
      this.contextMenuSubscriptions = new CompositeDisposable();
      this.contextMenuSubscriptions.add(atom.contextMenu.add({
        'atom-text-editor.diff-view': [{
          label: 'Diff View',
          submenu: [
            { label: 'Ignore Whitespace', command: 'diff-view:set-ignore-whitespace' },
            { label: 'Move to Next Diff', command: 'diff-view:next-diff' },
            { label: 'Move to Previous Diff', command: 'diff-view:prev-diff' },
            { label: 'Copy to Right', command: 'diff-view:copy-to-right' },
            { label: 'Copy to Left', command: 'diff-view:copy-to-left' }
          ]
        }]
      }));
    });
  },

  // called by both diffPanes and the editor subscription to update the diff
  updateDiff(editors) {
    this.isEnabled = true;

    // if there is a diff being computed in the background, cancel it
    if (this.process != null) {
      this.process.kill();
      this.process = null;
    }

    // force softwrap to be off if it somehow turned back on #143
    const turnOffSoftWrap = this.options.turnOffSoftWrap != null ? this.options.turnOffSoftWrap : this._getConfig('turnOffSoftWrap');
    if (turnOffSoftWrap) {
      if (editors.editor1.isSoftWrapped()) {
        editors.editor1.setSoftWrapped(false);
      }
      if (editors.editor2.isSoftWrapped()) {
        editors.editor2.setSoftWrapped(false);
      }
    }

    const ignoreWhitespace = this.options.ignoreWhitespace != null ? this.options.ignoreWhitespace : this._getConfig('ignoreWhitespace');
    const editorPaths = this._createTempFiles(editors);

    if (this.footerView != null) {
      this.footerView.setLoading();
    }

    // --- kick off background process to compute diff ---
    const { BufferedNodeProcess } = require('atom');
    const command = path.resolve(__dirname, './compute-diff.js');
    const args = [editorPaths.editor1Path, editorPaths.editor2Path, ignoreWhitespace];
    let theOutput = '';
    const stdout = (output) => {
      theOutput = output;
      const computedDiff = JSON.parse(output);
      this.process.kill();
      this.process = null;
      this._resumeUpdateDiff(editors, computedDiff);
    };
    const stderr = (err) => {
      theOutput = err;
    };
    const exit = (code) => {
      if (code !== 0) {
        console.log('BufferedNodeProcess code was ' + code);
        console.log(theOutput);
      }
    };
    this.process = new BufferedNodeProcess({ command, args, stdout, stderr, exit });
    // --- kick off background process to compute diff ---
  },

  // resumes after the compute diff process returns
  _resumeUpdateDiff(editors, computedDiff) {
    if (this.diffView == null) {
      return;
    }

    this.diffView.clearDiff();
    if (this.syncScroll != null) {
      this.syncScroll.dispose();
      this.syncScroll = null;
    }

    // grab the settings for the diff
    const addedColorSide = this.options.addedColorSide != null ? this.options.addedColorSide : this._getConfig('addedColorSide');
    const diffWords = this.options.diffWords != null ? this.options.diffWords : this._getConfig('diffWords');
    const ignoreWhitespace = this.options.ignoreWhitespace != null ? this.options.ignoreWhitespace : this._getConfig('ignoreWhitespace');
    const overrideThemeColors = this.options.overrideThemeColors != null ? this.options.overrideThemeColors : this._getConfig('overrideThemeColors');

    this.diffView.displayDiff(computedDiff, addedColorSide, diffWords, ignoreWhitespace, overrideThemeColors);

    // give the marker layers to those registered with the service
    while (this.splitDiffResolves && this.splitDiffResolves.length) {
      this.splitDiffResolves.pop()(this.diffView.getMarkerLayers());
    }

    if (this.footerView != null) {
      this.footerView.setNumDifferences(this.diffView.getNumDifferences());
    }

    const scrollSyncType = this.options.scrollSyncType != null ? this.options.scrollSyncType : this._getConfig('scrollSyncType');
    if (scrollSyncType === 'Vertical + Horizontal') {
      this.syncScroll = new SyncScroll(editors.editor1, editors.editor2, true);
      this.syncScroll.syncPositions();
    } else if (scrollSyncType === 'Vertical') {
      this.syncScroll = new SyncScroll(editors.editor1, editors.editor2, false);
      this.syncScroll.syncPositions();
    }

    // Update scroll-map layers with diff positions
    this._updateScrollMapLayers();
  },

  // Gets the first two visible editors found or creates them as needed.
  // Returns a Promise which yields a value of {editor1: TextEditor, editor2: TextEditor}
  _getEditorsForQuickDiff() {
    let editor1 = null;
    let editor2 = null;

    // try to find the first two editors
    const panes = atom.workspace.getCenter().getPanes();
    for (const p of panes) {
      const activeItem = p.getActiveItem();
      if (atom.workspace.isTextEditor(activeItem)) {
        if (editor1 === null) {
          editor1 = activeItem;
        } else if (editor2 === null) {
          editor2 = activeItem;
          break;
        }
      }
    }

    // auto open editor panes so we have two to diff with
    if (editor1 === null) {
      editor1 = atom.workspace.buildTextEditor({ autoHeight: false });
      this.wasEditor1Created = true;
      // add first editor to the first pane
      panes[0].addItem(editor1);
      panes[0].activateItem(editor1);
    }
    if (editor2 === null) {
      editor2 = atom.workspace.buildTextEditor({ autoHeight: false });
      this.wasEditor2Created = true;
      const rightPaneIndex = panes.indexOf(atom.workspace.paneForItem(editor1)) + 1;
      if (panes[rightPaneIndex]) {
        // add second editor to existing pane to the right of first editor
        panes[rightPaneIndex].addItem(editor2);
        panes[rightPaneIndex].activateItem(editor2);
      } else {
        // no existing pane so split right
        atom.workspace.paneForItem(editor1).splitRight({ items: [editor2] });
      }
      editor2.getBuffer().setLanguageMode(atom.grammars.languageModeForGrammarAndBuffer(editor1.getGrammar(), editor2.getBuffer()));
    }

    return Promise.resolve({ editor1: editor1, editor2: editor2 });
  },

  // Gets the active editor and opens the specified file to the right of it
  // Returns a Promise which yields a value of {editor1: TextEditor, editor2: TextEditor}
  _getEditorsForDiffWithActive(params) {
    let filePath = params.path;
    const editorWithoutPath = params.editor;
    const activeEditor = atom.workspace.getCenter().getActiveTextEditor();

    if (activeEditor != null) {
      const editor1 = activeEditor;
      this.wasEditor2Created = true;
      const panes = atom.workspace.getCenter().getPanes();
      // get index of pane following active editor pane
      const rightPaneIndex = panes.indexOf(atom.workspace.paneForItem(editor1)) + 1;
      // pane is created if there is not one to the right of the active editor
      const rightPane = panes[rightPaneIndex] || atom.workspace.paneForItem(editor1).splitRight();

      if (params.path) {
        filePath = params.path;
        if (editor1.getPath() === filePath) {
          // if diffing with itself, set filePath to null so an empty editor is
          // opened, which will cause a git diff
          filePath = null;
        }
        const editor2Promise = atom.workspace.openURIInPane(filePath, rightPane);

        return editor2Promise.then((editor2) => {
          editor2.getBuffer().setLanguageMode(atom.grammars.languageModeForGrammarAndBuffer(editor1.getGrammar(), editor2.getBuffer()));
          return { editor1: editor1, editor2: editor2 };
        });
      } else if (editorWithoutPath) {
        rightPane.addItem(editorWithoutPath);
        return Promise.resolve({ editor1: editor1, editor2: editorWithoutPath });
      }
    } else {
      const noActiveEditorMsg = 'No active file found! (Try focusing a text editor)';
      atom.notifications.addWarning('Diff View', { detail: noActiveEditorMsg, dismissable: false, icon: 'diff' });
      return Promise.resolve(null);
    }

    return Promise.resolve(null);
  },

  // sets up any editor listeners
  _setupEditorSubscriptions(editors) {
    if (this.editorSubscriptions != null) {
      this.editorSubscriptions.dispose();
    }
    this.editorSubscriptions = null;
    this.editorSubscriptions = new CompositeDisposable();

    // add listeners
    const autoDiff = this.options.autoDiff != null ? this.options.autoDiff : this._getConfig('autoDiff');
    if (autoDiff) {
      this.editorSubscriptions.add(editors.editor1.onDidStopChanging(() => {
        this.updateDiff(editors);
      }));
      this.editorSubscriptions.add(editors.editor2.onDidStopChanging(() => {
        this.updateDiff(editors);
      }));
    }
    this.editorSubscriptions.add(editors.editor1.onDidDestroy(() => {
      this.disable();
    }));
    this.editorSubscriptions.add(editors.editor2.onDidDestroy(() => {
      this.disable();
    }));
    this.editorSubscriptions.add(atom.config.onDidChange('diff-view', (event) => {
      // need to redo editor subscriptions because some settings affect the listeners themselves
      this._setupEditorSubscriptions(editors);

      // update footer view ignore whitespace checkbox if setting has changed
      if (event.newValue.ignoreWhitespace !== event.oldValue.ignoreWhitespace) {
        if (this.footerView != null) {
          this.footerView.setIgnoreWhitespace(event.newValue.ignoreWhitespace);
        }
      }
      if (event.newValue.autoDiff !== event.oldValue.autoDiff) {
        if (this.footerView != null) {
          this.footerView.setAutoDiff(event.newValue.autoDiff);
        }
      }

      this.updateDiff(editors);
    }));
    this.editorSubscriptions.add(editors.editor1.onDidChangeCursorPosition((event) => {
      this.diffView.handleCursorChange(event.cursor, event.oldBufferPosition, event.newBufferPosition);
    }));
    this.editorSubscriptions.add(editors.editor2.onDidChangeCursorPosition((event) => {
      this.diffView.handleCursorChange(event.cursor, event.oldBufferPosition, event.newBufferPosition);
    }));
    this.editorSubscriptions.add(editors.editor1.onDidAddCursor((cursor) => {
      this.diffView.handleCursorChange(cursor, -1, cursor.getBufferPosition());
    }));
    this.editorSubscriptions.add(editors.editor2.onDidAddCursor((cursor) => {
      this.diffView.handleCursorChange(cursor, -1, cursor.getBufferPosition());
    }));
  },

  _setupVisibleEditors(editors) {
    const BufferExtender = require('./buffer-extender');
    const buffer1LineEnding = new BufferExtender(editors.editor1.getBuffer()).getLineEnding();

    if (this.wasEditor2Created) {
      // want to scroll a newly created editor to the first editor's position
      atom.views.getView(editors.editor1).focus();
      // set the preferred line ending before inserting text #39
      if (buffer1LineEnding === '\n' || buffer1LineEnding === '\r\n') {
        this.lineEndingSubscription = new CompositeDisposable();
        this.lineEndingSubscription.add(editors.editor2.onWillInsertText(() => {
          editors.editor2.getBuffer().setPreferredLineEnding(buffer1LineEnding);
        }));
      }
    }

    this._setupGitRepo(editors);

    // unfold all lines so diffs properly align
    editors.editor1.unfoldAll();
    editors.editor2.unfoldAll();

    const muteNotifications = this.options.muteNotifications != null ? this.options.muteNotifications : this._getConfig('muteNotifications');
    const turnOffSoftWrap = this.options.turnOffSoftWrap != null ? this.options.turnOffSoftWrap : this._getConfig('turnOffSoftWrap');
    if (turnOffSoftWrap) {
      let shouldNotify = false;
      if (editors.editor1.isSoftWrapped()) {
        this.wasEditor1SoftWrapped = true;
        editors.editor1.setSoftWrapped(false);
        shouldNotify = true;
      }
      if (editors.editor2.isSoftWrapped()) {
        this.wasEditor2SoftWrapped = true;
        editors.editor2.setSoftWrapped(false);
        shouldNotify = true;
      }
      if (shouldNotify && !muteNotifications) {
        const softWrapMsg = 'Soft wrap automatically disabled for this diff.';
        atom.notifications.addInfo('Diff View', { detail: softWrapMsg, dismissable: false, icon: 'diff' });
      }
    }

    const buffer2LineEnding = new BufferExtender(editors.editor2.getBuffer()).getLineEnding();
    if (buffer2LineEnding !== '' && (buffer1LineEnding !== buffer2LineEnding) && editors.editor1.getLineCount() !== 1 && editors.editor2.getLineCount() !== 1 && !muteNotifications) {
      // pop warning if the line endings differ and we haven't done anything about it
      const lineEndingMsg = 'Warning: Line endings differ!';
      atom.notifications.addWarning('Diff View', { detail: lineEndingMsg, dismissable: false, icon: 'diff' });
    }
  },

  _setupGitRepo(editors) {
    const editor1Path = editors.editor1.getPath();
    // only show git changes if the right editor is empty
    if (editor1Path != null && (editors.editor2.getLineCount() === 1 && editors.editor2.lineTextForBufferRow(0) === '')) {
      const directories = atom.project.getDirectories();
      for (let i = 0; i < directories.length; i++) {
        const directory = directories[i];
        if (editor1Path === directory.getPath() || directory.contains(editor1Path)) {
          let projectRepo = atom.project.getRepositories()[i];
          if (projectRepo != null) {
            projectRepo = projectRepo.getRepo(editor1Path); // fix repo for submodules #112
            const relativeEditor1Path = projectRepo.relativize(editor1Path);
            const gitHeadText = projectRepo.getHeadBlob(relativeEditor1Path);
            if (gitHeadText != null) {
              editors.editor2.selectAll();
              editors.editor2.insertText(gitHeadText);
              this.hasGitRepo = true;
              break;
            }
          }
        }
      }
    }
  },

  // creates temp files so the compute diff process can get the text easily
  _createTempFiles(editors) {
    let editor1Path = '';
    let editor2Path = '';
    const tempFolderPath = atom.getConfigDirPath() + '/diff-view';

    editor1Path = tempFolderPath + '/diff-view 1';
    const editor1TempFile = new File(editor1Path);
    editor1TempFile.writeSync(editors.editor1.getText());

    editor2Path = tempFolderPath + '/diff-view 2';
    const editor2TempFile = new File(editor2Path);
    editor2TempFile.writeSync(editors.editor2.getText());

    const editorPaths = {
      editor1Path: editor1Path,
      editor2Path: editor2Path
    };

    return editorPaths;
  },

  _getConfig(config) {
    return atom.config.get(`diff-view.${config}`);
  },

  _setConfig(config, value) {
    atom.config.set(`diff-view.${config}`, value);
  },

  // --- SERVICE API ---
  getMarkerLayers() {
    return new Promise((resolve, reject) => {
      this.splitDiffResolves.push(resolve);
    });
  },

  diffEditors(editor1, editor2, options) {
    this.diffPanes(null, Promise.resolve({ editor1: editor1, editor2: editor2 }), options);
  },

  provideDiffView() {
    return {
      getMarkerLayers: this.getMarkerLayers.bind(this.contextForService),
      diffEditors: this.diffEditors.bind(this.contextForService),
      disable: this.disable.bind(this.contextForService)
    };
  },

  // --- SCROLL-MAP SERVICE ---
  consumeScrollMap(scrollMapService) {
    this.scrollMapService = scrollMapService;
    const diffViewModule = this;
    const ScrollMapLayer = scrollMapService.ScrollMapLayer;

    if (!ScrollMapLayer) {
      console.warn('diff-view: scroll-map ScrollMapLayer class not available');
      return;
    }

    // Create a custom layer class for diff-view
    class DiffViewLayer extends ScrollMapLayer {
      constructor(editor) {
        super({ editor: editor, name: 'diff-view', timer: 100 });
        this.threshold = 0;
        this.disposables.add(
          atom.config.observe('diff-view.scrollMapThreshold', (value) => {
            this.threshold = value;
            this.update();
          })
        );
      }

      recalculate() {
        this.items = [];
        if (!this.editor || !this.editor.component) {
          return;
        }

        // Get chunks from diff-view module
        const diffView = diffViewModule.diffView;
        if (!diffView || !diffView._chunks) {
          return;
        }

        const chunks = diffView._chunks;
        const editor1 = diffView._editorDiffExtender1 ? diffView._editorDiffExtender1.getEditor() : null;
        const editor2 = diffView._editorDiffExtender2 ? diffView._editorDiffExtender2.getEditor() : null;

        // Check if this editor is one of the diff editors
        // Use 'row' (screen row) for positioning - scroll-map handles pixel calculation
        if (this.editor === editor1) {
          // Add diff line markers
          for (const chunk of chunks) {
            for (let bufferRow = chunk.oldLineStart; bufferRow < chunk.oldLineEnd; bufferRow++) {
              this.items.push({
                row: this.editor.screenRowForBufferRow(bufferRow),
                cls: 'added'
              });
            }
          }
          // Add offset markers
          const offsets = diffView._oldLineOffsets || {};
          for (const bufferRow in offsets) {
            const screenRow = this.editor.screenRowForBufferRow(parseInt(bufferRow));
            this.items.push({ row: screenRow, cls: 'offset' });
          }
        } else if (this.editor === editor2) {
          // Add diff line markers
          for (const chunk of chunks) {
            for (let bufferRow = chunk.newLineStart; bufferRow < chunk.newLineEnd; bufferRow++) {
              this.items.push({
                row: this.editor.screenRowForBufferRow(bufferRow),
                cls: 'removed'
              });
            }
          }
          // Add offset markers
          const offsets = diffView._newLineOffsets || {};
          for (const bufferRow in offsets) {
            const screenRow = this.editor.screenRowForBufferRow(parseInt(bufferRow));
            this.items.push({ row: screenRow, cls: 'offset' });
          }
        }

        // Apply threshold
        if (this.threshold && this.threshold < this.items.length) {
          this.items = [];
        }
      }
    }

    this.DiffViewLayer = DiffViewLayer;
    this._updateScrollMapState();

    this.subscriptions.add(
      atom.config.observe('diff-view.scrollMapState', () => this._updateScrollMapState())
    );

    return new (require('atom').Disposable)(() => {
      scrollMapService.unregisterLayer('diff-view');
      this.scrollMapService = null;
      this.DiffViewLayer = null;
    });
  },

  // Update scroll-map state based on config
  _updateScrollMapState() {
    if (!this.scrollMapService || !this.DiffViewLayer) {
      return;
    }
    const enabled = this._getConfig('scrollMapState');
    if (enabled) {
      this.scrollMapService.registerLayer('diff-view', this.DiffViewLayer);
    } else {
      this.scrollMapService.unregisterLayer('diff-view');
    }
  },

  // Update scroll-map layers when diff changes
  _updateScrollMapLayers() {
    if (!this.scrollMapService || !this._getConfig('scrollMapState')) {
      return;
    }
    for (const editor of atom.workspace.getTextEditors()) {
      if (editor.scrollmap && editor.scrollmap.layers && editor.scrollmap.layers['diff-view']) {
        editor.scrollmap.layers['diff-view'].update();
      }
    }
  }
};
