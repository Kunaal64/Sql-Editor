import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Use Monaco's built-in generic SQL language. This avoids false-positive
// diagnostics from dialect-specific validators (e.g., PostgreSQL-only rules)
// while the backend (SQLite today, PostgreSQL tomorrow) remains the source of
// truth for execution and error reporting.
loader.config({ monaco });

self.MonacoEnvironment = {
  getWorker(_moduleId, _label) {
    return new editorWorker();
  },
};

let completionSchema = null;

/**
 * Refresh the schema used by the editor's autocomplete provider.
 * Called from the React app whenever the backend schema is loaded.
 */
export function setCompletionSchema(schema) {
  completionSchema = schema;
}

/**
 * Register a completion provider for generic SQL. It suggests table names
 * and, after a table alias or after typing a dot, column names.
 */
monaco.languages.registerCompletionItemProvider('sql', {
  triggerCharacters: ['.', ' '],

  provideCompletionItems(model, position) {
    if (!completionSchema || !completionSchema.tables) {
      return { suggestions: [] };
    }

    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    const lineText = model.getLineContent(position.lineNumber);
    const textBeforeCursor = lineText.slice(0, position.column - 1);

    const suggestions = [];

    // Suggest columns after a dot, e.g. "MOCK_DATA."
    const dotMatch = textBeforeCursor.match(/(?:\s|^)([\w_]+)\.$/);
    if (dotMatch) {
      const tablePrefix = dotMatch[1];
      const table = completionSchema.tables.find(
        (t) => t.name === tablePrefix
      );

      if (table) {
        for (const col of table.columns) {
          suggestions.push({
            label: `${table.name}.${col.name}`,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: col.name,
            detail: col.type,
            range,
          });
        }
      }
      return { suggestions };
    }

    // Otherwise suggest tables and columns globally.
    for (const table of completionSchema.tables) {
      suggestions.push({
        label: table.name,
        kind: monaco.languages.CompletionItemKind.Class,
        insertText: table.name,
        detail: 'table',
        range,
      });

      for (const col of table.columns) {
        suggestions.push({
          label: `${col.name} (${table.name})`,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: col.name,
          detail: `${col.type} — ${table.name}`,
          range,
        });
      }
    }

    return { suggestions };
  },
});
