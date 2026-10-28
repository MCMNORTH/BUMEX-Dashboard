import { useEffect, useMemo, useState } from 'react';
import { saveBoardWorkflowAction } from '@/app/(app)/projects/workflow-actions';
import { workflowEditorAction, type WorkflowEditorData } from '@/lib/erp/vanguard/project-actions';
import { boardWorkflowsAction } from '@/lib/erp/vanguard/board-actions';
import { WORKFLOW_MODELS, applyModel, modelOfBoard, type WorkflowModel } from '@/lib/tickets/workflow-models';
import { createStageId, describeTransitionError, draftToWorkflow, evaluateTransition, getStageCategoryLabel, MAX_ACTIVE_STAGES, STAGE_CATEGORIES, STAGE_NAME_MAX_LENGTH, toWorkflowDraft, type WorkflowDraft } from '@/lib/tickets/workflow';
import type { StageCategory, WorkflowSettings, WorkflowStage } from '@/types/workflow';
import { useStore } from '../store';
import { Chip, Icon } from '../ui/common';
import { reload } from './Tasks';
import { forgetWorkflows } from './stages';
import { useSay } from './say';
import { Select } from '../ui/Select';

// A mission's board, its columns and rules, as BUMEX One's workflow settings had them: stages (renamed, reordered,
// archived, never deleted), the default stage of new tickets, the completed stages, how cards may move, and custom
// transitions. Saved by BUMEX One's action, which checks it again and refuses a save over someone else's. [bumex-one]
// A board starts from a model (Standard, Développement, Audit) or another mission's board (asked on 2026-10-28,
// lib/tickets/workflow-models.ts): the draft changes, and nothing is saved until "Enregistrer".

const SETTINGS: { key: keyof WorkflowSettings; fr: [string, string]; en: [string, string] }[] = [
  { key: 'allow_backward', fr: ['Autoriser le retour en arrière', 'Les cartes peuvent revenir à une étape active précédente.'], en: ['Allow backward movement', 'Cards may move to an earlier active stage.'] },
  { key: 'allow_skip_forward', fr: ["Autoriser le saut d'étapes", "Sinon, une carte n'avance que vers l'étape active suivante."], en: ['Allow skipping forward', 'Otherwise a card can only move forward to the next active stage.'] },
  { key: 'allow_reopen', fr: ['Autoriser la réouverture des cartes terminées', "Une carte d'une étape terminée peut repartir vers une étape non terminée."], en: ['Allow reopening completed cards', 'A card in a completed stage may move to a non-completed stage.'] },
  { key: 'require_reason', fr: ['Exiger une raison pour un retour ou une réouverture', "Le motif est gardé dans l'historique du ticket."], en: ['Require a reason for backward moves or reopening', "The reason is kept in the ticket's history."] },
  { key: 'custom_transitions_enabled', fr: ['Transitions personnalisées', 'Seuls les déplacements cochés ci-dessous sont permis.'], en: ['Custom transitions', 'Only the moves ticked below are allowed.'] },
];

export function WorkflowEditor({ projectId }: { projectId: string }) {
  const say = useSay();
  const { ui, state } = useStore();
  const [copyFrom, setCopyFrom] = useState('');
  const [data, setData] = useState<WorkflowEditorData | null>(null);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [message, setMessage] = useState<{ kind: 'crit' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState({ from: '', to: '' });

  useEffect(() => {
    let live = true;
    workflowEditorAction(projectId).then((d) => { if (live) { setData(d); setDraft(toWorkflowDraft(d.workflow)); } }).catch(() => live && setMessage({ kind: 'crit', text: 'Workflow indisponible / unavailable.' }));
    return () => { live = false; };
  }, [projectId]);

  const preview = useMemo(() => (draft ? draftToWorkflow({ ...draft, stages: draft.stages.map((s, position) => ({ ...s, position })) }, projectId) : null), [draft, projectId]);
  if (!data || !draft || !preview) return <div className="card"><span className="muted">{message?.text ?? say('Chargement du tableau…', 'Loading the board…')}</span></div>;

  const readOnly = !data.canManage;
  const locale = ui.lang === 'fr' ? 'fr' : 'en';
  const saved = new Set(data.workflow.stages.map((s) => s.id));
  const active = draft.stages.filter((s) => !s.archived_at);
  const archived = draft.stages.filter((s) => s.archived_at);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toWorkflowDraft(data.workflow));
  const edit = (change: (d: WorkflowDraft) => WorkflowDraft) => setDraft((d) => (d ? change(d) : d));
  const update = (id: string, patch: Partial<WorkflowStage>) => edit((d) => ({ ...d, stages: d.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  // a step among the active stages; archived ones keep their slot
  const move = (id: string, by: -1 | 1) => edit((d) => {
    const ids = d.stages.filter((s) => !s.archived_at).map((s) => s.id);
    const other = ids[ids.indexOf(id) + by];
    if (!other) return d;
    const stages = [...d.stages];
    const a = stages.findIndex((s) => s.id === id);
    const b = stages.findIndex((s) => s.id === other);
    [stages[a], stages[b]] = [stages[b], stages[a]];
    return { ...d, stages };
  });
  const add = () => edit((d) => ({ ...d, stages: [...d.stages, { id: createStageId(), name: '', position: d.stages.length, is_default: false, is_completed: false, category: 'in_progress', archived_at: null }] }));
  const drop = (id: string) => edit((d) => ({
    ...d,
    stages: d.stages.filter((s) => s.id !== id),
    transitions: Object.fromEntries(Object.entries(d.transitions).filter(([from]) => from !== id).map(([from, to]) => [from, to.filter((t) => t !== id)])),
  }));
  const toggle = (from: string, to: string) => edit((d) => {
    const list = d.transitions[from] ?? [];
    return { ...d, transitions: { ...d.transitions, [from]: list.includes(to) ? list.filter((t) => t !== to) : [...list, to] } };
  });
  // every move the settings allow, as a starting point for custom rules
  const fill = () => edit((d) => {
    const board = draftToWorkflow({ ...d, custom_transitions_enabled: false, require_reason: false, stages: d.stages.map((s, position) => ({ ...s, position })) }, projectId);
    const stages = d.stages.filter((s) => !s.archived_at);
    return { ...d, transitions: Object.fromEntries(stages.map((from) => [from.id, stages.filter((to) => to.id !== from.id && evaluateTransition(board, from.id, to.id).ok).map((to) => to.id)])) };
  });
  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveBoardWorkflowAction(projectId, draft, data.workflow.updated_at);
      if (result.error) { setMessage({ kind: 'crit', text: result.error }); return; }
      const next = await workflowEditorAction(projectId);
      setData(next);
      setDraft(toWorkflowDraft(next.workflow));
      setMessage({ kind: 'info', text: say("Tableau enregistré. Aucune carte n'a été déplacée.", 'Board saved. No card was moved.') });
      forgetWorkflows(projectId);
      await reload();
    } catch {
      setMessage({ kind: 'crit', text: say("Serveur injoignable : le tableau n'a pas changé.", 'Server unreachable: the board did not change.') });
    } finally {
      setSaving(false);
    }
  };
  const result = test.from && test.to && test.from !== test.to ? evaluateTransition(preview, test.from, test.to) : null;
  const takeModel = (model: Pick<WorkflowModel, 'stages' | 'settings'>, name: string) => {
    edit((d) => applyModel(d, model, data.cardCounts));
    const kept = draft.stages.filter((s) => !s.archived_at && (data.cardCounts[s.id] ?? 0) > 0 && !model.stages.some((m) => m.name.toLowerCase() === s.name.toLowerCase()));
    setMessage({ kind: 'info', text: say(`« ${name} » appliqué. Vérifiez puis enregistrez le tableau.`, `"${name}" applied. Check it, then save the board.`)
      + (kept.length ? say(` Gardées car elles ont des cartes : ${kept.map((s) => s.name).join(', ')}.`, ` Kept because they hold cards: ${kept.map((s) => s.name).join(', ')}.`) : '') });
  };
  const copy = async () => {
    const source = (state.engagements as { id: string; name: string; projectId?: string }[]).find((e) => e.projectId === copyFrom);
    if (!source) return;
    const boards = await boardWorkflowsAction([copyFrom]).catch(() => null);
    if (!boards?.[copyFrom]) { setMessage({ kind: 'crit', text: say('Ce tableau est indisponible.', 'That board is unavailable.') }); return; }
    takeModel(modelOfBoard(boards[copyFrom]), source.name);
    setCopyFrom('');
  };
  const others = (state.engagements as { id: string; name: string; code: string; projectId?: string }[]).filter((e) => e.projectId && e.projectId !== projectId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!data.workflow.is_configured && <div className="banner info">{say('Ce tableau utilise encore les étapes intégrées, avec déplacement libre. Enregistrer crée sa propre configuration ; chaque ticket garde son étape.', 'This board still uses the built-in stages, with free movement. Saving creates its own configuration; every ticket keeps its stage.')}</div>}
      {readOnly && <div className="banner warn">{say("Lecture seule : seuls l'administrateur et les managers du projet changent son tableau.", "Read-only: only the administrator and the project's managers change its board.")}</div>}
      {message && <div className={`banner ${message.kind}`}>{message.text}</div>}

      {!readOnly && (
        <div className="card wf-start">
          <b>{say('Partir de', 'Start from')}</b>
          {WORKFLOW_MODELS.map((m) => (
            <button key={m.id} className="btn sm" onClick={() => takeModel(m, say(m.fr, m.en))} title={say(...m.hint)}>{say(m.fr, m.en)}</button>
          ))}
          <span className="small muted">{say('ou copier le tableau de', "or copy the board of")}</span>
          <Select className="in" style={{ width: 240 }} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} recent="missions">
            <option value="">{say('une autre mission…', 'another mission…')}</option>
            {others.map((e) => <option key={e.id} value={e.projectId} data-search={e.code}>{e.code} · {e.name}</option>)}
          </Select>
          <button className="btn sm" disabled={!copyFrom} onClick={copy}>{say('Copier', 'Copy')}</button>
        </div>
      )}

      <div className="card flush">
        <table>
          <thead><tr><th style={{ width: 70 }} /><th>{say('Étape', 'Stage')}</th><th>{say('Compte comme', 'Counts as')}</th><th>{say('Terminée', 'Completed')}</th><th>{say('Par défaut', 'Default')}</th><th className="num">{say('Cartes', 'Cards')}</th><th /></tr></thead>
          <tbody>
            {active.map((s, i) => {
              const cards = data.cardCounts[s.id] ?? 0;
              return (
                <tr key={s.id}>
                  <td>
                    <button className="btn sm ghost" disabled={readOnly || i === 0} onClick={() => move(s.id, -1)} aria-label={say('Monter', 'Up')}><Icon name="chevronUp" size={13} /></button>
                    <button className="btn sm ghost" disabled={readOnly || i === active.length - 1} onClick={() => move(s.id, 1)} aria-label={say('Descendre', 'Down')}><Icon name="chevronDown" size={13} /></button>
                  </td>
                  <td><input className="in" value={s.name} maxLength={STAGE_NAME_MAX_LENGTH} disabled={readOnly} onChange={(e) => update(s.id, { name: e.target.value })} placeholder={say("Nom de l'étape", 'Stage name')} /></td>
                  <td>
                    <Select className="in" value={s.is_completed ? 'done' : s.category} disabled={readOnly || s.is_completed} onChange={(e) => update(s.id, { category: e.target.value as StageCategory })}>
                      {s.is_completed ? <option value="done">{getStageCategoryLabel('done', locale)}</option> : STAGE_CATEGORIES.map((c) => <option key={c} value={c}>{getStageCategoryLabel(c, locale)}</option>)}
                    </Select>
                  </td>
                  <td><input type="checkbox" checked={s.is_completed} disabled={readOnly} onChange={(e) => update(s.id, { is_completed: e.target.checked })} aria-label={say('Terminée', 'Completed')} /></td>
                  <td><input type="radio" name={`default-${projectId}`} checked={s.is_default} disabled={readOnly} onChange={() => edit((d) => ({ ...d, stages: d.stages.map((x) => ({ ...x, is_default: x.id === s.id })) }))} aria-label={say('Par défaut', 'Default')} /></td>
                  <td className="num">{cards}</td>
                  <td>
                    {saved.has(s.id)
                      ? <button className="btn sm" disabled={readOnly || cards > 0 || s.is_default || active.length <= 1} title={cards > 0 ? say("Déplacez d'abord ses cartes vers une autre étape.", 'Move its cards to another stage first.') : s.is_default ? say("Choisissez d'abord une autre étape par défaut.", 'Choose another default stage first.') : ''} onClick={() => update(s.id, { archived_at: new Date().toISOString(), is_default: false })}>{say('Archiver', 'Archive')}</button>
                      : <button className="btn sm ghost" disabled={readOnly} onClick={() => drop(s.id)} aria-label={say('Retirer', 'Remove')}><Icon name="close" size={13} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn sm" disabled={readOnly || active.length >= MAX_ACTIVE_STAGES} onClick={add}><Icon name="plus" size={13} /> {say('Ajouter une étape', 'Add a stage')}</button>
          {archived.length > 0 && <span className="small muted">{say('Archivées', 'Archived')} :</span>}
          {archived.map((s) => <span key={s.id} className="small"><Chip kind="dim">{s.name}</Chip> {!readOnly && <button className="btn sm ghost" onClick={() => update(s.id, { archived_at: null })}>{say('Restaurer', 'Restore')}</button>}</span>)}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ margin: 0 }}>{say('Déplacements', 'Moves')}</h2>
        {SETTINGS.map(({ key, fr, en }) => (
          <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={draft[key]} disabled={readOnly} onChange={(e) => edit((d) => ({ ...d, [key]: e.target.checked }))} style={{ marginTop: 3 }} />
            <span><b>{say(fr[0], en[0])}</b><br /><span className="small muted">{say(fr[1], en[1])}</span></span>
          </label>
        ))}
        {draft.custom_transitions_enabled && (
          <>
            <div className="actions" style={{ justifyContent: 'flex-start' }}><button className="btn sm" disabled={readOnly} onClick={fill}>{say('Partir des réglages ci-dessus', 'Start from the settings above')}</button></div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>{say('De ↓ · vers →', 'From ↓ · to →')}</th>{active.map((s) => <th key={s.id}>{s.name || '—'}</th>)}</tr></thead>
                <tbody>
                  {active.map((from) => (
                    <tr key={from.id}>
                      <td><b>{from.name || '—'}</b></td>
                      {active.map((to) => <td key={to.id}>{from.id === to.id ? '·' : <input type="checkbox" checked={(draft.transitions[from.id] ?? []).includes(to.id)} disabled={readOnly} onChange={() => toggle(from.id, to.id)} aria-label={`${from.name} → ${to.name}`} />}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>{say('Essayer un déplacement', 'Try a move')}</b>
        <Select className="in" style={{ width: 180 }} value={test.from} onChange={(e) => setTest({ ...test, from: e.target.value })}><option value="">{say('de…', 'from…')}</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name || '—'}</option>)}</Select>
        <Select className="in" style={{ width: 180 }} value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })}><option value="">{say('vers…', 'to…')}</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name || '—'}</option>)}</Select>
        {result && (result.ok
          ? <Chip kind="good">{say('Permis', 'Allowed')}{result.backward || result.reopen ? (draft.require_reason ? say(' · avec un motif', ' · with a reason') : '') : ''}</Chip>
          : <Chip kind="crit">{describeTransitionError(result.error, locale)}</Chip>)}
      </div>

      {!readOnly && <div className="actions"><button className="btn sm" disabled={!dirty || saving} onClick={() => setDraft(toWorkflowDraft(data.workflow))}>{say('Annuler les changements', 'Discard the changes')}</button><button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? say('Enregistrement…', 'Saving…') : say('Enregistrer le tableau', 'Save the board')}</button></div>}
    </div>
  );
}
