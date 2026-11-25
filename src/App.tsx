import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Layers3,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Code2,
  Copy,
  FileJson2,
  GitCompareArrows,
  GitBranch,
  History,
  Info,
  LockKeyhole,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react';
import { JsonEditor } from './components/JsonEditor';
import { CodeBlock } from './components/CodeBlock';
import { examples } from './domain/examples';
import {
  applyPatch,
  createMigration,
  equal,
  guardedPatch,
  LIMITS,
  parseDocument,
  replay,
  validatePatch,
} from './domain/patch';
import type { JsonValue, Migration } from './domain/patch';
import optics from './assets/optics.webp';
import './styles.css';

const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const initial = examples[0];
const initialMigration = createMigration(initial.before, initial.after);
function preview(value: JsonValue | undefined): string {
  if (value === undefined) return '—';
  const text = JSON.stringify(value);
  return text.length > 70 ? `${text.slice(0, 67)}…` : text;
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([`${pretty(value)}\n`], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [exampleId, setExampleId] = useState(initial.id);
  const [beforeText, setBeforeText] = useState(pretty(initial.before));
  const [afterText, setAfterText] = useState(pretty(initial.after));
  const [compared, setCompared] = useState({
    before: pretty(initial.before),
    after: pretty(initial.after),
  });
  const [migration, setMigration] = useState<Migration>(initialMigration);
  const [step, setStep] = useState(0);
  const [activeView, setActiveView] = useState<'changes' | 'patch' | 'replay'>('changes');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [guarded, setGuarded] = useState(true);
  const [working, setWorking] = useState<JsonValue>(initial.before);
  const [applied, setApplied] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const patchInput = useRef<HTMLInputElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const dirty = beforeText !== compared.before || afterText !== compared.after;
  const selectedExample = examples.find((example) => example.id === exampleId);
  const counts = useMemo(
    () => ({
      add: migration.patch.filter((op) => op.op === 'add').length,
      replace: migration.patch.filter((op) => op.op === 'replace').length,
      remove: migration.patch.filter((op) => op.op === 'remove').length,
      caution: migration.changes.filter((change) => change.caution).length,
    }),
    [migration],
  );
  const filtered = migration.changes
    .map((change, index) => ({ ...change, index }))
    .filter(
      (change) =>
        (filter === 'all' || change.operation.op === filter) &&
        `${change.operation.path} ${preview(change.before)} ${preview(change.after)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  const currentReplay = useMemo(() => replay(migration, step), [migration, step]);
  const exportPatch = useMemo(
    () => (guarded ? guardedPatch(migration) : migration.patch),
    [guarded, migration],
  );
  useEffect(() => {
    if (!showGuide) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function containFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.guide-modal button'),
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', containFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', containFocus);
    };
  }, [showGuide]);

  function reportError(message: string) {
    setError(message);
    setNotice('');
  }
  function resetPlan(plan: Migration, left: string, right: string) {
    setMigration(plan);
    setCompared({ before: left, after: right });
    setStep(0);
    setWorking(plan.before);
    setApplied(false);
    setShowResult(false);
    setError('');
  }
  function compare() {
    try {
      const plan = createMigration(parseDocument(beforeText), parseDocument(afterText));
      resetPlan(plan, beforeText, afterText);
      setNotice(
        plan.patch.length
          ? `${plan.patch.length} changes verified. Forward and rollback plans are ready.`
          : 'The documents are structurally equal. No migration is needed.',
      );
    } catch (exception) {
      reportError(exception instanceof Error ? exception.message : 'Unable to compare documents.');
    }
  }
  function chooseExample(id: string) {
    const example = examples.find((item) => item.id === id)!;
    const left = pretty(example.before);
    const right = pretty(example.after);
    setExampleId(id);
    setBeforeText(left);
    setAfterText(right);
    resetPlan(createMigration(example.before, example.after), left, right);
    setNotice('Synthetic example loaded. Edit either document to make it your own.');
    setQuery('');
    setFilter('all');
  }
  function swap() {
    setBeforeText(afterText);
    setAfterText(beforeText);
    setNotice('Documents swapped. Compare again to build a new plan.');
    setError('');
  }
  function apply() {
    try {
      const result = applyPatch(working, guardedPatch(migration));
      if (!equal(result, migration.after)) throw new Error('Result does not match the target.');
      setWorking(result);
      setApplied(true);
      setShowResult(true);
      setNotice('Patch applied to the local working copy. The result matches the target.');
      setError('');
    } catch (exception) {
      reportError(exception instanceof Error ? exception.message : 'Unable to apply patch.');
    }
  }
  function rollback() {
    try {
      const result = applyPatch(working, guardedPatch(migration, 'rollback'));
      if (!equal(result, migration.before)) throw new Error('Rollback does not match the source.');
      setWorking(result);
      setApplied(false);
      setShowResult(true);
      setNotice('Rollback verified. The original values are restored.');
      setError('');
    } catch (exception) {
      reportError(exception instanceof Error ? exception.message : 'Unable to roll back.');
    }
  }
  async function copyPatch() {
    try {
      await navigator.clipboard.writeText(pretty(exportPatch));
      setNotice('Patch copied to the clipboard.');
      setError('');
    } catch {
      reportError('Clipboard access is unavailable. Download the patch instead.');
    }
  }
  async function importPatch(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > LIMITS.patchBytes)
        throw new Error('Patch file exceeds the 1 MB import limit.');
      const operations = validatePatch(JSON.parse(await file.text()));
      const before = parseDocument(beforeText);
      const after = applyPatch(before, operations);
      const right = pretty(after);
      setAfterText(right);
      setExampleId('custom');
      resetPlan(createMigration(before, after), beforeText, right);
      setNotice(
        `Imported ${operations.length} operations. The resulting structural plan is ready to inspect.`,
      );
    } catch (exception) {
      reportError(exception instanceof Error ? exception.message : 'Unable to import patch.');
    } finally {
      event.target.value = '';
    }
  }
  function closeGuide() {
    setShowGuide(false);
    helpButton.current?.focus();
  }

  return (
    <>
      <a className="skip-link" href="#documents">
        Skip to editors
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="wordmark" href="#workspace" aria-label="Patchglass home">
            <span className="brand-mark">
              <Layers3 size={25} strokeWidth={1.6} />
            </span>
            Patchglass
          </a>
          <nav aria-label="Main navigation">
            <a className="nav-active" href="#documents">
              Workspace
            </a>
            <a href="#review-title">Migration plan</a>
          </nav>
          <div className="header-tools">
            <button ref={helpButton} onClick={() => setShowGuide(true)}>
              <BookOpen size={15} /> Guide
            </button>
            <a
              className="github-link"
              href="https://github.com/xxspartan16/patchglass"
              target="_blank"
              rel="noreferrer"
              aria-label="Patchglass on GitHub"
              title="GitHub repository"
            >
              <GitBranch size={16} />
            </a>
          </div>
        </div>
      </header>
      <main id="workspace">
        <section
          className="intro"
          onPointerMove={(event) => {
            if (event.pointerType !== 'mouse') return;
            const bounds = event.currentTarget.getBoundingClientRect();
            event.currentTarget.style.setProperty(
              '--shift-x',
              `${((event.clientX - bounds.left - bounds.width / 2) / bounds.width) * 13}px`,
            );
            event.currentTarget.style.setProperty(
              '--shift-y',
              `${((event.clientY - bounds.top - bounds.height / 2) / bounds.height) * 9}px`,
            );
          }}
          onPointerLeave={(event) => {
            event.currentTarget.style.removeProperty('--shift-x');
            event.currentTarget.style.removeProperty('--shift-y');
          }}
        >
          <div className="intro-inner">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="eyebrow-line" /> JSON migration workbench
              </p>
              <h1>
                Configuration
                <br />
                <span>changes.</span>
              </h1>
              <p className="intro-copy">
                Compare JSON documents, inspect each change, and verify a rollback before you apply
                it.
              </p>
              <div className="hero-actions">
                <a className="hero-button" href="#documents">
                  Open workspace <ArrowDown size={15} />
                </a>
                <span className="local-indicator">
                  <span /> Runs locally
                </span>
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <img src={optics} alt="" width="1120" height="780" fetchPriority="high" />
            </div>
          </div>
        </section>
        <div className="workbench">
          <div className="workspace-toolbar" id="documents">
            <div>
              <h2>Documents</h2>
              <p>Paste or import your source and target JSON.</p>
            </div>
            <div className="examples">
              <span className="toolbar-label">Examples</span>
              <div className="example-tabs" aria-label="Synthetic examples">
                {examples.map((example) => (
                  <button
                    key={example.id}
                    className={exampleId === example.id ? 'selected' : ''}
                    aria-pressed={exampleId === example.id}
                    onClick={() => chooseExample(example.id)}
                  >
                    {example.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="editors">
            <JsonEditor
              title="Before"
              filename={selectedExample?.file ?? 'source.json'}
              value={beforeText}
              variant="before"
              onError={reportError}
              onChange={(text) => {
                setBeforeText(text);
                setExampleId('custom');
              }}
            />
            <button
              className="swap-button"
              onClick={swap}
              aria-label="Swap source and target documents"
              title="Swap documents"
            >
              <ArrowLeftRight size={17} />
            </button>
            <JsonEditor
              title="After"
              filename={selectedExample?.file ?? 'target.json'}
              value={afterText}
              variant="after"
              onError={reportError}
              onChange={(text) => {
                setAfterText(text);
                setExampleId('custom');
              }}
            />
          </div>
          <div className="compare-row">
            <p>
              <Info size={14} /> Objects compare by key. Arrays compare by position.
            </p>
            <div>
              <button className="text-button" onClick={() => patchInput.current?.click()}>
                <FileJson2 size={15} /> Import a patch
              </button>
              <input
                ref={patchInput}
                type="file"
                accept=".json,application/json,application/json-patch+json"
                hidden
                aria-label="Choose patch file"
                onChange={importPatch}
              />
              <button className="primary-button compare-button" onClick={compare}>
                <GitCompareArrows size={17} /> Compare documents <ArrowRight size={16} />
              </button>
            </div>
          </div>
          {error ? (
            <div className="message error" role="alert">
              <Info size={17} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className="message notice" role="status">
              <CircleCheck size={16} />
              <span>{notice}</span>
              <button aria-label="Dismiss notice" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          ) : null}

          <section
            className={`review-section ${dirty ? 'is-stale' : ''}`}
            aria-labelledby="review-title"
          >
            <div className="review-heading">
              <div>
                <h2 id="review-title">Migration plan</h2>
                <p>Inspect operations, replay individual steps, or export a patch.</p>
              </div>
              <div className="plan-status">
                {dirty ? (
                  <span className="stale-badge">Uncompared edits · compare again</span>
                ) : (
                  <span className="verified-badge">
                    <ShieldCheck size={14} /> Round trip verified
                  </span>
                )}
              </div>
            </div>
            <div className="review-layout">
              <div className="review-panel">
                <div
                  className="review-tabs"
                  role="tablist"
                  aria-label="Migration inspection"
                  onKeyDown={(event) => {
                    const names = ['changes', 'patch', 'replay'] as const;
                    const index = names.indexOf(activeView);
                    const next =
                      event.key === 'ArrowRight'
                        ? (index + 1) % 3
                        : event.key === 'ArrowLeft'
                          ? (index + 2) % 3
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? 2
                              : -1;
                    if (next >= 0) {
                      event.preventDefault();
                      setActiveView(names[next]);
                      event.currentTarget
                        .querySelectorAll<HTMLButtonElement>('[role="tab"]')
                        [next]?.focus();
                    }
                  }}
                >
                  <button
                    id="changes-tab"
                    role="tab"
                    tabIndex={activeView === 'changes' ? 0 : -1}
                    aria-selected={activeView === 'changes'}
                    aria-controls="changes-panel"
                    onClick={() => setActiveView('changes')}
                    className={activeView === 'changes' ? 'active' : ''}
                  >
                    <GitCompareArrows size={15} /> Changes <span>{migration.patch.length}</span>
                  </button>
                  <button
                    id="patch-tab"
                    role="tab"
                    tabIndex={activeView === 'patch' ? 0 : -1}
                    aria-selected={activeView === 'patch'}
                    aria-controls="patch-panel"
                    onClick={() => setActiveView('patch')}
                    className={activeView === 'patch' ? 'active' : ''}
                  >
                    <Code2 size={15} /> Patch
                  </button>
                  <button
                    id="replay-tab"
                    role="tab"
                    tabIndex={activeView === 'replay' ? 0 : -1}
                    aria-selected={activeView === 'replay'}
                    aria-controls="replay-panel"
                    onClick={() => setActiveView('replay')}
                    className={activeView === 'replay' ? 'active' : ''}
                  >
                    <History size={15} /> Replay
                  </button>
                </div>
                {activeView === 'changes' ? (
                  <div id="changes-panel" role="tabpanel" aria-labelledby="changes-tab">
                    <div className="change-tools">
                      <label className="search">
                        <Search size={15} />
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Find a path or value…"
                          aria-label="Search changes"
                        />
                      </label>
                      <select
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        aria-label="Filter by operation"
                      >
                        <option value="all">All operations</option>
                        <option value="add">Additions</option>
                        <option value="replace">Replacements</option>
                        <option value="remove">Removals</option>
                      </select>
                    </div>
                    <div className="change-list">
                      {filtered.length ? (
                        filtered.map((change) => (
                          <button
                            className="change-row"
                            key={change.index}
                            onClick={() => {
                              setStep(change.index + 1);
                              setActiveView('replay');
                            }}
                          >
                            <span className={`operation-icon ${change.operation.op}`}>
                              {change.operation.op === 'add'
                                ? '+'
                                : change.operation.op === 'remove'
                                  ? '−'
                                  : '~'}
                            </span>
                            <span className="change-details">
                              <span className="change-path">
                                {change.operation.path || '(document root)'}
                              </span>
                              <span className="change-values">
                                <span
                                  className={change.operation.op !== 'add' ? 'old-value' : 'absent'}
                                >
                                  {preview(change.before)}
                                </span>
                                <ArrowRight size={12} />
                                <span
                                  className={
                                    change.operation.op !== 'remove' ? 'new-value' : 'absent'
                                  }
                                >
                                  {preview(change.after)}
                                </span>
                              </span>
                              {change.caution ? (
                                <span className="change-caution">
                                  <Info size={11} /> {change.caution}
                                </span>
                              ) : null}
                            </span>
                            <span className={`operation-label ${change.operation.op}`}>
                              {change.operation.op}
                            </span>
                            <ChevronRight className="row-arrow" size={15} />
                          </button>
                        ))
                      ) : (
                        <div className="empty-state">
                          <CircleCheck size={28} />
                          <h3>
                            {migration.patch.length ? 'No matching changes' : 'The documents match'}
                          </h3>
                          <p>
                            {migration.patch.length
                              ? 'Try another path, value, or operation.'
                              : 'The documents have equal JSON values. Key order and whitespace do not create changes.'}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="panel-footnote">
                      {filtered.length} of {migration.patch.length} changes{' '}
                      <span>
                        Click a change to inspect that step <ArrowRight size={12} />
                      </span>
                    </div>
                  </div>
                ) : null}
                {activeView === 'patch' ? (
                  <div id="patch-panel" role="tabpanel" aria-labelledby="patch-tab">
                    <div className="patch-tools">
                      <label>
                        <input
                          type="checkbox"
                          checked={guarded}
                          onChange={(event) => setGuarded(event.target.checked)}
                        />{' '}
                        Include source precondition
                      </label>
                      <button className="text-button" onClick={copyPatch} disabled={dirty}>
                        <Copy size={14} /> Copy
                      </button>
                    </div>
                    <CodeBlock value={exportPatch} label="Generated JSON patch" />
                    <div className="panel-footnote">
                      RFC 6902 · add, remove, replace, test{' '}
                      <span>{guarded ? 'Rejects a stale source' : 'Precondition disabled'}</span>
                    </div>
                  </div>
                ) : null}
                {activeView === 'replay' ? (
                  <div id="replay-panel" role="tabpanel" aria-labelledby="replay-tab">
                    <div className="replay-controls">
                      <div className="replay-buttons">
                        <button
                          className="icon-button"
                          aria-label="Previous replay step"
                          disabled={step === 0}
                          onClick={() => setStep((s) => s - 1)}
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <span>
                          STEP <b>{String(step).padStart(2, '0')}</b> /{' '}
                          {String(migration.patch.length).padStart(2, '0')}
                        </span>
                        <button
                          className="icon-button"
                          aria-label="Next replay step"
                          disabled={step === migration.patch.length}
                          onClick={() => setStep((s) => s + 1)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={migration.patch.length}
                        value={step}
                        onChange={(event) => setStep(Number(event.target.value))}
                        aria-label="Replay step"
                      />
                      <button className="text-button" onClick={() => setStep(0)}>
                        <RotateCcw size={14} /> Reset
                      </button>
                    </div>
                    <div className="replay-current">
                      <span
                        className={`operation-label ${step ? migration.patch[step - 1].op : ''}`}
                      >
                        {step ? migration.patch[step - 1].op : 'source'}
                      </span>
                      <code>
                        {step
                          ? migration.patch[step - 1].path || '(root)'
                          : 'Original document. No operations applied.'}
                      </code>
                    </div>
                    <CodeBlock value={currentReplay} label={`Document after step ${step}`} />
                    <div className="panel-footnote">
                      Replay is a preview <span>The working copy is unchanged</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <aside className="plan-card" aria-label="Migration summary">
                <span className="plan-card-kicker">Migration summary</span>
                <div className="change-count">
                  {String(migration.patch.length).padStart(2, '0')}
                  <span>
                    structural
                    <br />
                    changes
                  </span>
                </div>
                <div className="count-breakdown">
                  <div>
                    <span className="count-dot add" /> Added <b>{counts.add}</b>
                  </div>
                  <div>
                    <span className="count-dot replace" /> Replaced <b>{counts.replace}</b>
                  </div>
                  <div>
                    <span className="count-dot remove" /> Removed <b>{counts.remove}</b>
                  </div>
                </div>
                {counts.caution ? (
                  <div className="caution-box">
                    <Info size={15} />
                    <p>
                      <b>
                        {counts.caution} {counts.caution === 1 ? 'change needs' : 'changes need'} a
                        closer look.
                      </b>
                      <span>
                        Removals and type changes may affect consumers. These are review hints, not
                        schema validation.
                      </span>
                    </p>
                  </div>
                ) : (
                  <div className="safe-box">
                    <Check size={15} /> No removals or type changes.
                  </div>
                )}
                <div className="plan-actions">
                  <button
                    className="primary-button"
                    onClick={apply}
                    disabled={dirty || applied || migration.patch.length === 0}
                  >
                    <Play size={15} />{' '}
                    {applied ? 'Applied to working copy' : 'Apply to working copy'}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={rollback}
                    disabled={dirty || !applied}
                  >
                    <Undo2 size={16} /> Roll back
                  </button>
                  <div className="download-actions">
                    <button
                      onClick={() => download(exportPatch, 'migration.patch.json')}
                      disabled={dirty}
                    >
                      <ArrowDownToLine size={14} /> Patch
                    </button>
                    <button
                      onClick={() =>
                        download(guardedPatch(migration, 'rollback'), 'rollback.patch.json')
                      }
                      disabled={dirty}
                    >
                      <ArrowDownToLine size={14} /> Rollback
                    </button>
                  </div>
                </div>
                <p className="local-caption">
                  <LockKeyhole size={12} /> Applies in memory. No files are overwritten.
                </p>
              </aside>
            </div>
          </section>
          {showResult ? (
            <section className="result-section" aria-labelledby="working-title">
              <div className="result-header">
                <div>
                  <span className="verified-badge">
                    <CircleCheck size={14} /> {applied ? 'Target verified' : 'Source restored'}
                  </span>
                  <h2 id="working-title">Your working copy</h2>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => download(working, applied ? 'migrated.json' : 'restored.json')}
                >
                  <ArrowDownToLine size={15} /> Download document
                </button>
              </div>
              <CodeBlock value={working} label="Working copy JSON" />
            </section>
          ) : null}
        </div>
      </main>
      <footer>
        <div className="footer-inner">
          <span>
            <Layers3 size={17} /> Patchglass <span className="footer-divider">/</span> Brennan
            LeBlanc
          </span>
          <span>
            <LockKeyhole size={13} /> Refreshing clears this workspace.
          </span>
        </div>
      </footer>
      {showGuide ? (
        <div className="modal-backdrop" onClick={closeGuide}>
          <section
            className="guide-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeGuide();
            }}
          >
            <button
              className="icon-button modal-close"
              autoFocus
              onClick={closeGuide}
              aria-label="Close guide"
            >
              <X size={21} />
            </button>
            <h2 id="guide-title">Workspace guide</h2>
            <ol>
              <li>
                <b>Bring two JSON documents.</b>
                <p>
                  Paste or import the current and proposed configurations. The examples are
                  synthetic.
                </p>
              </li>
              <li>
                <b>Compare and inspect.</b>
                <p>
                  Review additions, replacements, and removals. Click a change to replay its exact
                  position in the plan.
                </p>
              </li>
              <li>
                <b>Apply and verify rollback.</b>
                <p>
                  Apply the patch to a separate working copy. Rollback restores the original JSON
                  values. Download either patch when you are ready.
                </p>
              </li>
            </ol>
            <div className="guide-limits">
              <b>Supported inputs</b>
              <p>
                Documents: 200 KB, 40 levels, 20,000 values. Plans: 999 changes. Arrays compare by
                index; reordering can produce several replacements. No move/copy operations, root
                removal, full JSON Schema validation, or big-integer precision. Reserved JavaScript
                object keys are rejected. Formatting is not preserved.
              </p>
            </div>
            <button className="primary-button" onClick={closeGuide}>
              Back to the workbench <ArrowRight size={16} />
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
export default App;
