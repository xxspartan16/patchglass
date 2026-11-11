import { Fragment } from 'react';

const tokenPattern =
  /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\btrue\b|\bfalse\b|\bnull\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g;
function highlight(line: string) {
  return line.split(tokenPattern).map((token, i) => {
    const kind = token.startsWith('"')
      ? token.trimEnd().endsWith(':')
        ? 'key'
        : 'string'
      : /^(true|false|null)$/.test(token)
        ? 'literal'
        : /^-?\d/.test(token)
          ? 'number'
          : '';
    return kind ? (
      <span key={i} className={`syntax-${kind}`}>
        {token}
      </span>
    ) : (
      <Fragment key={i}>{token}</Fragment>
    );
  });
}
export function CodeBlock({
  value,
  label,
  numbered = true,
}: {
  value: unknown;
  label: string;
  numbered?: boolean;
}) {
  const text = JSON.stringify(value, null, 2) ?? 'undefined';
  return (
    <pre className="code-block" aria-label={label}>
      <code>
        {text.split('\n').map((line, i) => (
          <span className="code-line" key={i}>
            {numbered ? (
              <span className="code-number" aria-hidden="true">
                {i + 1}
              </span>
            ) : null}
            <span>{highlight(line)}</span>
            {'\n'}
          </span>
        ))}
      </code>
    </pre>
  );
}
