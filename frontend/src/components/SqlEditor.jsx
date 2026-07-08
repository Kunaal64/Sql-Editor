import { useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { setCompletionSchema } from '../monaco/setup';

export function SqlEditor({ value, onChange, schema, height = '300px' }) {
  useEffect(() => {
    if (schema) {
      setCompletionSchema(schema);
    }
  }, [schema]);

  return (
    <Editor
      height={height}
      defaultLanguage="sql"
      value={value}
      onChange={(newValue) => onChange(newValue ?? '')}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
        // Let the backend validate SQL; Monaco only highlights and completes.
        formatOnPaste: false,
        formatOnType: false,
      }}
    />
  );
}
