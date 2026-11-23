import { useMemo, useState } from 'react';
import {
  TOPICS, TOPIC_LABELS, STATUSES, STATUS_LABELS, normalizeRuleClarifications, mergeSeeds, answerItem, setStatus,
  setOwnerReply, addRequest, buildClarificationRequestText, buildAnswersMarkdown,
} from '../lib/ruleClarifications.js';

// "Rule questions" tab: the chief answers scheduling-rule questions and files new rule requests. Everything
// is stored in appSettings.ruleClarifications (STORED shape: only touched seeds + requests); the view merges
// the seeds in. Writes use the functional setAppSettings form so a concurrent edit elsewhere is not clobbered.

const STATUS_CHIP = {
  open: 'tri-review-chip',
  answered: 'bg-green-100 text-green-800',
  applied: 'bg-gray-100 text-gray-700',
  withdrawn: 'bg-gray-100 text-gray-500',
};

function fmt(at) {
  if (!at) return '';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function NoteBox({ item, onSave, disabled }) {
  const saved = item.answer?.note || '';
  const [text, setText] = useState(saved);
  const [seen, setSeen] = useState(saved);
  // Re-sync when the saved note changes from elsewhere (cloud sync) and the box is not being edited.
  if (saved !== seen) { setSeen(saved); setText(saved); }
  return (
    <textarea value={text} disabled={disabled} rows={2} placeholder="Add a note (saves when you tap away)"
      aria-label={`Note for ${item.title}`}
      onChange={e => setText(e.target.value)}
      onBlur={() => { if (text !== saved) onSave(text); }}
      className="w-full mt-3 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 disabled:opacity-60"/>
  );
}

function OwnerReplyBox({ item, onSave }) {
  const saved = item.ownerReply?.text || '';
  const [text, setText] = useState(saved);
  return (
    <div className="mt-3">
      <label className="text-xs font-semibold text-gray-600">Owner reply (admin)</label>
      <textarea value={text} rows={2} onChange={e => setText(e.target.value)}
        onBlur={() => { if (text.trim() !== saved) onSave(text); }}
        className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800"/>
    </div>
  );
}

function ItemCard({ item, isAdmin, by, onAnswer, onStatus, onReply }) {
  const locked = item.status === 'withdrawn';
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_CHIP[item.status]}`}>{STATUS_LABELS[item.status]}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5">
        {TOPIC_LABELS[item.topic]}{item.kind === 'request' ? ` · New request${item.createdBy ? ` from ${item.createdBy}` : ''}` : ''}
      </p>
      {item.detail && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{item.detail}</p>}
      {item.currentRule && <p className="text-xs text-gray-600 mt-2"><span className="font-semibold">What the app does now:</span> {item.currentRule}</p>}

      {item.options.length > 0 && (
        <div role="radiogroup" aria-label={item.title} className="flex flex-col gap-2 mt-3">
          {item.options.map(op => {
            const on = item.answer?.choice === op.id;
            return (
              <button key={op.id} type="button" role="radio" aria-checked={on} disabled={locked}
                onClick={() => onAnswer(item.id, { choice: on ? '' : op.id })}
                className="tri-pick flex items-center justify-between gap-2 text-left px-3 py-2 disabled:opacity-50">
                <span className={`tri-pick__label text-sm font-medium ${on ? '' : 'text-gray-700'}`}>{op.label}</span>
                {op.id === item.recommended && <span className="tri-an-chip text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">Suggested</span>}
              </button>
            );
          })}
        </div>
      )}

      <NoteBox item={item} disabled={locked} onSave={note => onAnswer(item.id, { note })}/>

      {item.answer && (item.answer.by || item.answer.at) && (
        <p className="text-[11px] text-gray-500 mt-2">Answered{item.answer.by ? ` by ${item.answer.by}` : ''}{item.answer.at ? ` on ${fmt(item.answer.at)}` : ''}</p>
      )}
      {item.ownerReply && !isAdmin && (
        <div className="mt-3 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800">
          <span className="font-semibold">Reply:</span> {item.ownerReply.text}
        </div>
      )}
      {isAdmin && (
        <>
          <OwnerReplyBox item={item} onSave={t => onReply(item.id, t)}/>
          <div className="flex flex-wrap gap-2 mt-3">
            {item.status !== 'applied' && <button type="button" onClick={() => onStatus(item.id, 'applied')} className="min-h-[44px] px-3 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">Mark applied</button>}
            {item.status !== 'withdrawn' && <button type="button" onClick={() => onStatus(item.id, 'withdrawn')} className="min-h-[44px] px-3 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">Withdraw</button>}
            {(item.status === 'applied' || item.status === 'withdrawn') && <button type="button" onClick={() => onStatus(item.id, item.answer ? 'answered' : 'open')} className="min-h-[44px] px-3 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">Reopen</button>}
          </div>
        </>
      )}
    </div>
  );
}

export default function RuleClarificationsTab({ appSettings, setAppSettings, viewer, showToast }) {
  const isAdmin = (viewer?.role || 'admin') === 'admin';
  const by = viewer?.email || 'chief';
  const items = useMemo(() => mergeSeeds(appSettings?.ruleClarifications).items, [appSettings?.ruleClarifications]);
  const [statusF, setStatusF] = useState('all');
  const [topicF, setTopicF] = useState('all');
  const [form, setForm] = useState({ title: '', detail: '', topic: 'shift-rules' });

  const write = fn => setAppSettings(p => ({ ...p, ruleClarifications: fn(normalizeRuleClarifications(p?.ruleClarifications)) }));
  const onAnswer = (id, a) => write(s => answerItem(s, id, { ...a, by }));
  const onStatus = (id, st) => write(s => setStatus(s, id, st));
  const onReply = (id, t) => write(s => setOwnerReply(s, id, t));

  const count = s => items.filter(i => i.status === s).length;
  const shown = items.filter(i => (statusF === 'all' || i.status === statusF) && (topicF === 'all' || i.topic === topicF));
  const toast = (m, tone) => { if (typeof showToast === 'function') showToast(m, tone); };

  async function copyQuestions() {
    const text = buildClarificationRequestText(items);
    try { await navigator.clipboard.writeText(text); toast('Questions copied. Paste into a text or email.', 'green'); }
    catch { toast('Could not copy. Select the text manually.', 'amber'); }
  }
  // Plain Blob download on purpose: requestExport/exportConfirm gates SCHEDULE exports on pending violations,
  // which is irrelevant to a text file of rule answers.
  function downloadAnswers() {
    const blob = new Blob([buildAnswersMarkdown(items)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `rule-answers-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function submitRequest(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    write(s => addRequest(s, { ...form, by }));
    setForm({ title: '', detail: '', topic: form.topic });
    toast('Request added.', 'green');
  }

  const chip = (on, label, onClick) => (
    <button key={label} type="button" onClick={onClick} aria-pressed={on}
      className={`min-h-[44px] px-3 text-xs font-semibold rounded-full border ${on ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>{label}</button>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-base font-bold text-gray-900">Rule questions</h2>
        <p className="text-sm text-gray-600 mt-1">Answer how the schedule should handle these cases. One tap saves. You can also ask for a new rule below.</p>
        <p className="text-sm font-semibold text-gray-800 mt-2">Open {count('open')} · Answered {count('answered')} · Applied {count('applied')}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" onClick={copyQuestions} className="min-h-[44px] px-3 text-sm font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">Copy questions for the chief</button>
          <button type="button" onClick={downloadAnswers} className="min-h-[44px] px-3 text-sm font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">Download answers (.md)</button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {chip(statusF === 'all', 'All', () => setStatusF('all'))}
          {STATUSES.map(s => chip(statusF === s, STATUS_LABELS[s], () => setStatusF(s)))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
          {chip(topicF === 'all', 'All topics', () => setTopicF('all'))}
          {TOPICS.map(t => chip(topicF === t, TOPIC_LABELS[t], () => setTopicF(t)))}
        </div>
      </div>

      {shown.length === 0 && <div className="text-sm text-gray-500 bg-white rounded-xl border border-gray-200 px-5 py-6 text-center">Nothing matches these filters.</div>}
      {shown.map(it => <ItemCard key={it.id} item={it} isAdmin={isAdmin} by={by} onAnswer={onAnswer} onStatus={onStatus} onReply={onReply}/>)}

      <form onSubmit={submitRequest} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Request a new rule or change</h3>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Short title" aria-label="Request title"
          className="w-full min-h-[44px] text-sm border border-gray-200 rounded-lg px-3 bg-white text-gray-800"/>
        <textarea value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))} rows={3} placeholder="Describe what should change and why" aria-label="Request detail"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800"/>
        <select value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} aria-label="Request topic"
          className="w-full min-h-[44px] text-sm border border-gray-200 rounded-lg px-3 bg-white text-gray-800">
          {TOPICS.map(t => <option key={t} value={t}>{TOPIC_LABELS[t]}</option>)}
        </select>
        <button type="submit" disabled={!form.title.trim()} className="min-h-[44px] px-4 text-sm font-semibold rounded-lg bg-primary text-white disabled:opacity-50">Submit request</button>
      </form>
    </div>
  );
}
