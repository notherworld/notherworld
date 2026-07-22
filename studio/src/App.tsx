import { useEffect, useMemo, useState } from 'react';
import { Builder } from './builder';
import { Preview } from './preview';
import { Help } from './help';
import { blankSpec, normalizeSpec, toJson, type Spec } from './spec';
import meridian from './worlds/meridian.json';

const TEMPLATES: Record<string, () => Spec> = {
  'Starter · dividing cells': blankSpec,
  'Meridian · a living city': () => normalizeSpec(meridian),
};

const SAVE_KEY = 'owos.studio.spec';

export default function App() {
  const [spec, setSpec] = useState<Spec>(() => {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) { try { return normalizeSpec(JSON.parse(saved)); } catch { /* fall through */ } }
    return blankSpec();
  });
  const [mode, setMode] = useState<'build' | 'json'>('build');
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonErr, setJsonErr] = useState('');
  const [panel, setPanel] = useState<'help' | 'ship' | null>(null);
  const [savedNote, setSavedNote] = useState('');

  const patch = (fn: (draft: Spec) => void) => setSpec((s) => { const c = structuredClone(s); fn(c); return c; });

  // Debounced spec JSON drives the live preview (rebuilds ~half a second after edits settle).
  const specJson = useMemo(() => toJson(spec), [spec]);
  const [previewJson, setPreviewJson] = useState(specJson);
  useEffect(() => { const t = setTimeout(() => setPreviewJson(specJson), 450); return () => clearTimeout(t); }, [specJson]);

  const enterJson = () => { setJsonDraft(toJson(spec)); setJsonErr(''); setMode('json'); };
  const onJsonEdit = (v: string) => {
    setJsonDraft(v);
    try { setSpec(normalizeSpec(JSON.parse(v))); setJsonErr(''); }
    catch (e) { setJsonErr(String(e).replace(/^SyntaxError:\s*/, '')); }
  };

  const loadTemplate = (name: string) => { setSpec(TEMPLATES[name]()); setMode('build'); };
  const save = () => { localStorage.setItem(SAVE_KEY, toJson(spec)); setSavedNote('saved'); setTimeout(() => setSavedNote(''), 1500); };
  const download = () => {
    const blob = new Blob([toJson(spec)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (spec.name || 'world').replace(/\s+/g, '-').toLowerCase() + '.json';
    a.click(); URL.revokeObjectURL(a.href);
  };
  const upload = (f: File) => { f.text().then((t) => { try { setSpec(normalizeSpec(JSON.parse(t))); setMode('build'); } catch (e) { setJsonErr(String(e)); } }); };

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">otherworld<b>OS</b> <em>studio</em></div>
        <span className="spacer" />
        <select className="tmpl" defaultValue="" onChange={(e) => { if (e.target.value) loadTemplate(e.target.value); e.target.value = ''; }}>
          <option value="">Templates…</option>
          {Object.keys(TEMPLATES).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button onClick={() => { setSpec(blankSpec()); setMode('build'); }}>New</button>
        <label className="filebtn">Import<input type="file" accept="application/json,.json" onChange={(e) => e.target.files && upload(e.target.files[0])} /></label>
        <button onClick={download}>Export</button>
        <button onClick={save}>{savedNote || 'Save'}</button>
        <span className="spacer" />
        <button className={panel === 'help' ? 'accent' : ''} onClick={() => setPanel((p) => (p === 'help' ? null : 'help'))}>Formula help</button>
        <button className={panel === 'ship' ? 'accent' : ''} onClick={() => setPanel((p) => (p === 'ship' ? null : 'ship'))}>Ship it</button>
      </header>

      <main className="studio-cols">
        <section className="author">
          <div className="author-tabs">
            <button className={mode === 'build' ? 'on' : ''} onClick={() => setMode('build')}>Build</button>
            <button className={mode === 'json' ? 'on' : ''} onClick={enterJson}>Spec JSON</button>
            <span className="muted-inline">{mode === 'build' ? 'compose your world; it runs live on the right →' : 'raw spec — paste your own, or hand-edit'}</span>
          </div>
          <div className="author-body">
            {mode === 'build'
              ? <Builder spec={spec} patch={patch} />
              : <div className="jsonedit">
                  {jsonErr && <div className="jsonerr">{jsonErr}</div>}
                  <textarea value={jsonDraft} spellCheck={false} onChange={(e) => onJsonEdit(e.target.value)} />
                </div>}
          </div>
        </section>

        {panel && (
          <section className="side-panel">
            <div className="side-head"><b>{panel === 'help' ? 'The formula language' : 'Ship it — put this world in your game'}</b><button className="x" onClick={() => setPanel(null)}>×</button></div>
            {panel === 'help' ? <Help /> : <Ship spec={spec} />}
          </section>
        )}

        <section className="run">
          <div className="run-head"><b>{spec.name || 'untitled'}</b> <span className="muted-inline">live — it re-runs as you build</span></div>
          <Preview specJson={previewJson} />
        </section>
      </main>
    </div>
  );
}

function Ship({ spec }: { spec: Spec }) {
  const snippet = `import init, { Scope } from './owos_wasm'   // wasm-pack output

await init()
const world = new Scope(spec)      // spec = your exported world JSON (string)

// drive it from your game loop:
world.reveal(0)                    // zoom the root in
world.step()                       // advance one tick
const snap = JSON.parse(world.snapshot_json())   // entities, stats, edges, events
// …render snap however your engine wants. otherworldOS owns the world; you own the pixels.`;
  return (
    <div className="ship">
      <p className="muted">otherworldOS is the world-brain you embed — it owns state, behaviour, and offscreen life; your engine owns rendering and input. Three ways in, one core:</p>
      <ol className="ship-steps">
        <li><b>Export</b> this world (the Export button) → a portable spec JSON.</li>
        <li><b>Build the module</b> for your target:
          <div className="code">wasm-pack build crates/owos-wasm --target web{'\n'}# also: --target bundler | nodejs   (web/JS)</div>
          <div className="muted">Native (Unreal / Unity / Godot): link <code>owos_ffi</code> and include <code>owos.h</code> — the same core over a C ABI.</div>
        </li>
        <li><b>Load &amp; drive it</b> from your game:</li>
      </ol>
      <div className="code">{snippet}</div>
      <div className="muted">Your current world is {spec.seed.length} seed entit{spec.seed.length === 1 ? 'y' : 'ies'}, {spec.rules.length} rules, {spec.actions.length} behaviours, {spec.generators.length} generators. Deterministic (seed {spec.rng_seed}) — same inputs, same world, on web or native.</div>
    </div>
  );
}
