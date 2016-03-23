/* eslint-env browser */

'use strict';

function $(sel) { return document.querySelector(sel); }

(function(root, initModule) {
  if (typeof exports === 'object') {
    module.exports = initModule;
  } else {
    root.ohmEditor = root.ohmEditor || {};
    initModule(root.ohm, root.ohmEditor, root.cmUtil, root.CodeMirror);
  }
})(this, function(ohm, ohmEditor, cmUtil, CodeMirror) {
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  // EXPORTS
  ohmEditor.options = {};
  ohmEditor.ui = {
    inputEditor: CodeMirror($('#inputContainer .editorWrapper')),
    grammarEditor: CodeMirror($('#grammarContainer .editorWrapper'))
  };
  ohmEditor.grammar = null;

  // Misc Helpers (EXPORTS)
  // ----------------------

  ohmEditor.errorMarks = {
    grammar: null,
    input: null
  };

  ohmEditor.hideError = function(category, editor) {
    var errInfo = this.errorMarks[category];
    if (errInfo) {
      errInfo.mark.clear();
      clearTimeout(errInfo.timeout);
      if (errInfo.widget) {
        errInfo.widget.clear();
      }
      this.errorMarks[category] = null;
    }
  };

  ohmEditor.setError = function(category, editor, interval, message) {
    this.hideError(category, editor);

    this.errorMarks[category] = {
      mark: cmUtil.markInterval(editor, interval, 'error-interval', false),
      timeout: setTimeout(this.showError.bind(this, category, editor, interval, message), 1500),
      widget: null
    };
  };

  ohmEditor.showError = function(category, editor, interval, message) {
    var errorEl = document.createElement('div');
    errorEl.className = 'error';
    errorEl.textContent = message;
    var line = editor.posFromIndex(interval.endIdx).line;
    this.errorMarks[category].widget = editor.addLineWidget(line, errorEl, {insertAt: 0});
  };

  ohmEditor.hideBottomOverlay = function() {
    $('#bottomSection .overlay').style.width = 0;
  };

  ohmEditor.showBottomOverlay = function() {
    $('#bottomSection .overlay').style.width = '100%';
  };

  ohmEditor.restoreEditorState = function(editor, key, defaultEl) {
    var value = localStorage.getItem(key);
    if (value) {
      editor.setValue(value);
    } else if (defaultEl) {
      editor.setValue(defaultEl.textContent);
    }
  };

  ohmEditor.saveEditorState = function(editor, key) {
    localStorage.setItem(key, editor.getValue());
  };

  ohmEditor.parseGrammar = function() {
    var source = this.ui.grammarEditor.getValue();
    var matchResult = ohm.ohmGrammar.match(source);
    var grammar;
    var err;

    if (matchResult.succeeded()) {
      var ns = {};
      try {
        ohm._buildGrammar(matchResult, ns);
        var firstProp = Object.keys(ns)[0];
        if (firstProp) {
          grammar = ns[firstProp];
        }
      } catch (ex) {
        err = ex;
      }
    } else {
      err = {
        message: matchResult.message,
        shortMessage: matchResult.shortMessage,
        interval: matchResult.getInterval()
      };
    }
    return {
      matchResult: matchResult,
      grammar: grammar,
      error: err
    };
  };

  // Main
  // ----

  var checkboxes = document.querySelectorAll('#options input[type=checkbox]');
  var refreshTimeout;
  var grammarChanged = true;

  var options = ohmEditor.options;

  ohmEditor.searchBar.initializeForEditor(ohmEditor.ui.inputEditor);
  ohmEditor.searchBar.initializeForEditor(ohmEditor.ui.grammarEditor);

  var ui = ohmEditor.ui;

  function triggerRefresh(delay) {
    ohmEditor.showBottomOverlay();
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(ohmEditor.refresh.bind(ohmEditor), delay || 0);
  }
  Array.prototype.forEach.call(checkboxes, function(cb) {
    cb.addEventListener('click', function(e) { triggerRefresh(); });
  });

  ohmEditor.restoreEditorState(ohmEditor.ui.inputEditor, 'input', $('#sampleInput'));
  ohmEditor.restoreEditorState(ohmEditor.ui.grammarEditor, 'grammar', $('#sampleGrammar'));

  ohmEditor.ui.inputEditor.on('change', function() { triggerRefresh(250); });
  ohmEditor.ui.grammarEditor.on('change', function() {
    grammarChanged = true;
    ohmEditor.hideError('grammar', ohmEditor.ui.grammarEditor);
    triggerRefresh(250);
  });

  ohmEditor.refresh = function() {
    this.hideError('input', this.ui.inputEditor);
    this.saveEditorState(this.ui.inputEditor, 'input');

    // Refresh the option values.
    for (var i = 0; i < checkboxes.length; ++i) {
      var checkbox = checkboxes[i];
      options[checkbox.name] = checkbox.checked;
    }

    if (grammarChanged) {
      grammarChanged = false;
      this.saveEditorState(this.ui.grammarEditor, 'grammar');

      var result = this.parseGrammar();
      this.grammar = result.grammar;
      this.updateExternalRules(this.ui.grammarEditor, result.matchResult, this.grammar);
      this.updateRuleHyperlinks(this.ui.grammarEditor, result.matchResult, this.grammar);
      if (result.error) {
        var err = result.error;
        this.setError('grammar', this.ui.grammarEditor, err.interval,
          err.shortMessage || err.message);
        return;
      }
    }

    if (this.grammar && this.grammar.defaultStartRule) {
      // TODO: Move this stuff to parseTree.js. We probably want a proper event system,
      // with events like 'beforeGrammarParse' and 'afterGrammarParse'.
      this.hideBottomOverlay();

      var trace = this.grammar.trace(this.ui.inputEditor.getValue());
      if (trace.result.failed()) {
        // Intervals with start == end won't show up in CodeMirror.
        var interval = trace.result.getInterval();
        interval.endIdx += 1;
        this.setError('input', this.ui.inputEditor, interval,
          'Expected ' + trace.result.getExpectedText());
      }

      this.refreshParseTree(ui, this.grammar, trace, options.showFailures);
    }
  };

  /* eslint-disable no-console */
  console.log('%cOhm visualizer', 'color: #e0a; font-family: Avenir; font-size: 18px;');
  console.log([
    '- `ohm` is the Ohm library',
    '- `grammar` is the current grammar object (if the source is valid)'
  ].join('\n'));
  /* eslint-enable no-console */

  ohmEditor.refresh();

  $$('.hiddenDuringLoading').forEach(function(el) {
    el.classList.remove('hiddenDuringLoading');
  });
});
