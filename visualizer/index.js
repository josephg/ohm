/* eslint-env browser */
/* global cmUtil, CodeMirror, ohm, ohmEditor */

'use strict';

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

if (typeof ohmEditor === 'undefined') {
  ohmEditor = {}; // eslint-disable-line no-undef
}

ohmEditor.options = {};
ohmEditor.inputEditor = CodeMirror($('#inputContainer .editorWrapper'));
ohmEditor.grammarEditor = CodeMirror($('#grammarContainer .editorWrapper'));
ohmEditor.grammar = null;

// Misc Helpers
// ------------

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
    timeout: setTimeout(function() {
      this.showError(category, editor, interval, message);
    }.bind(this), 1500),
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

ohmEditor.parseGrammar = function(source) {
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

(function main() {
  var checkboxes = document.querySelectorAll('#options input[type=checkbox]');
  var refreshTimeout;
  var grammarChanged = true;

  var options = ohmEditor.options;
  var inputEditor = ohmEditor.inputEditor;
  var grammarEditor = ohmEditor.grammarEditor;

  ohmEditor.searchBar.initializeForEditor(inputEditor);
  ohmEditor.searchBar.initializeForEditor(grammarEditor);

  var ui = {
    grammarEditor: grammarEditor,
    inputEditor: inputEditor
  };

  function triggerRefresh(delay) {
    ohmEditor.showBottomOverlay();
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(refresh, delay || 0);
  }
  Array.prototype.forEach.call(checkboxes, function(cb) {
    cb.addEventListener('click', function(e) { triggerRefresh(); });
  });

  ohmEditor.restoreEditorState(inputEditor, 'input', $('#sampleInput'));
  ohmEditor.restoreEditorState(grammarEditor, 'grammar', $('#sampleGrammar'));

  inputEditor.on('change', function() { triggerRefresh(250); });
  grammarEditor.on('change', function() {
    grammarChanged = true;
    ohmEditor.hideError('grammar', grammarEditor);
    triggerRefresh(250);
  });

  function refresh() {
    ohmEditor.hideError('input', inputEditor);
    ohmEditor.saveEditorState(inputEditor, 'input');

    // Refresh the option values.
    for (var i = 0; i < checkboxes.length; ++i) {
      var checkbox = checkboxes[i];
      options[checkbox.name] = checkbox.checked;
    }

    if (grammarChanged) {
      grammarChanged = false;
      ohmEditor.saveEditorState(grammarEditor, 'grammar');

      var result = ohmEditor.parseGrammar(grammarEditor.getValue());
      ohmEditor.grammar = result.grammar;
      ohmEditor.updateExternalRules(grammarEditor, result.matchResult, ohmEditor.grammar);
      ohmEditor.updateRuleHyperlinks(grammarEditor, result.matchResult, ohmEditor.grammar);
      if (result.error) {
        var err = result.error;
        ohmEditor.setError('grammar', grammarEditor, err.interval,
          err.shortMessage || err.message);
        return;
      }
    }

    if (ohmEditor.grammar && ohmEditor.grammar.defaultStartRule) {
      // TODO: Move this stuff to parseTree.js. We probably want a proper event system,
      // with events like 'beforeGrammarParse' and 'afterGrammarParse'.
      ohmEditor.hideBottomOverlay();

      var trace = ohmEditor.grammar.trace(inputEditor.getValue());
      if (trace.result.failed()) {
        // Intervals with start == end won't show up in CodeMirror.
        var interval = trace.result.getInterval();
        interval.endIdx += 1;
        ohmEditor.setError('input', inputEditor, interval,
          'Expected ' + trace.result.getExpectedText());
      }

      ohmEditor.refreshParseTree(ui, ohmEditor.grammar, trace, options.showFailures);
    }
  }

  /* eslint-disable no-console */
  console.log('%cOhm visualizer', 'color: #e0a; font-family: Avenir; font-size: 18px;');
  console.log([
    '- `ohm` is the Ohm library',
    '- `grammar` is the current grammar object (if the source is valid)'
  ].join('\n'));
  /* eslint-enable no-console */

  refresh();

  $$('.hiddenDuringLoading').forEach(function(el) {
    el.classList.remove('hiddenDuringLoading');
  });
})();
