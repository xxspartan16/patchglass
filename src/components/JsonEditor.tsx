import { useId, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Braces, FileUp, Sparkles } from 'lucide-react';
import { LIMITS, parseDocument } from '../domain/patch';

type Props = {
  title: string;
  filename: string;
  value: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
  variant: 'before' | 'after';
};

export function JsonEditor({ title, filename, value, onChange, onError, variant }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > LIMITS.bytes) throw new Error('File exceeds the 200 KB limit.');
      const text = await file.text();
      parseDocument(text);
      onChange(text);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to read file.');
    } finally {
      event.target.value = '';
    }
  }
  function format() {
    try {
      onChange(JSON.stringify(parseDocument(value), null, 2));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to format JSON.');
    }
  }
  const lines = value.split('\n').length;
  return (
    <section className={`editor-card editor-${variant}`} aria-labelledby={`${id}-title`}>
      <div className="editor-title">
        <div className="editor-label">
          <span className={`document-dot ${variant}`} />
          <h2 id={`${id}-title`}>{title}</h2>
          <span className="file-name">{filename}</span>
        </div>
        <div className="editor-tools">
          <button
            className="icon-button"
            onClick={format}
            title={`Format ${title.toLowerCase()} JSON`}
            aria-label={`Format ${title.toLowerCase()} JSON`}
          >
            <Sparkles size={15} />
          </button>
          <button
            className="icon-button"
            onClick={() => input.current?.click()}
            title={`Import ${title.toLowerCase()} JSON`}
            aria-label={`Import ${title.toLowerCase()} JSON`}
          >
            <FileUp size={16} />
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            aria-label={`Choose ${title.toLowerCase()} file`}
            hidden
            onChange={importFile}
          />
        </div>
      </div>
      <div className="editor-body">
        <div ref={gutter} className="line-numbers" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          aria-label={`${title} JSON`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          onScroll={(event) => {
            if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
          }}
        />
      </div>
      <div className="editor-footer">
        <span>
          <Braces size={13} /> JSON
        </span>
        <span>
          {lines} lines · {new TextEncoder().encode(value).length.toLocaleString()} bytes
        </span>
      </div>
    </section>
  );
}
