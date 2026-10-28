import { useEffect, useMemo, useState } from 'react';
import { saveFloorBoardAction } from '@/app/(app)/projects/workflow-actions';
import { floorBoardEditorAction, floorBoardSourceAction, type FloorBoardEditor } from '@/lib/erp/vanguard/board-actions';
import { WORKFLOW_MODELS, applyModel, modelOfBoard, type WorkflowModel } from '@/lib/tickets/workflow-models';
import { createStageId, describeTransitionError, draftToWorkflow, evaluateTransition, getStageCategoryLabel, MAX_ACTIVE_STAGES, STAGE_CATEGORIES, STAGE_NAME_MAX_LENGTH, strandedStages, toWorkflowDraft, transitionsFromSettings, type WorkflowDraft } from '@/lib/tickets/workflow';
import type { StageCategory, WorkflowSettings, WorkflowStage } from '@/types/workflow';
import { useStore } from '../store';
import { Chip, Icon } from '../ui/common';
import { reload } from './Tasks';
import { forgetWorkflows } from './stages';
import { useSay } from './say';
import { Select } from '../ui/Select';

// The floor's board (0014: one per entity, every mission of the floor follows it; asked on 2026-10-28), its columns and
// rules, as BUMEX One's workflow settings had them: stages (renamed, reordered, archived, never deleted), the default
// stage of new tickets, the completed stages, how cards may move, and custom transitions. The Tasks room's "Statuts et
// règles" tab. Saved by the administrators and the floor's managers; the server checks it again against every ticket
// of the floor and refuses a save over someone else's. [bumex-one] A board starts from a model (Standard,
// Développement, Audit) or another floor's board (lib/tickets/workflow-models.ts): the draft changes, and nothing is
// saved until "Enregistrer".

const SETTINGS: { key: keyof WorkflowSettings; fr: [string, string]; en: [string, string] }[] = [
  { key: 'allow_backward', fr: ['Autoriser le retour en arrière', 'Les cartes peuvent revenir à une étape active précédente.'], en: ['Allow backward movement', 'Cards may move to an earlier active stage.'] },
  { key: 'allow_skip_forward', fr: ["Autoriser le saut d'étapes", "Sinon, une carte n'avance que vers l'étape active suivante."], en: ['Allow skipping forward', 'Otherwise a card can only move forward to the next active stage.'] },
  { key: 'allow_reopen', fr: ['Autoriser la réouverture des cartes terminées', "Une carte d'une étape terminée peut repartir vers une étape non terminée."], en: ['Allow reopening completed cards', 'A card in a completed stage may move to a non-completed stage.'] },
  { key: 'require_reason', fr: ['Exiger une raison pour un retour ou une réouverture', "Le motif est gardé dans l'historique du ticket."], en: ['Require a reason for backward moves or reopening', "The reason is kept in the ticket's history."] },
  { key: 'custom_transitions_enabled', fr: ['Transitions personnalisées', 'Seuls les déplacements cochés ci-dessous sont permis.'], en: ['Custom transitions', 'Only the moves ticked below are allowed.'] },
];

export function WorkflowEditor({ entityId }: { entityId: string }) {
  const say = useSay();
  const { ui, state } = useStore();
  const [copyFrom, setCopyFrom] = useState('');
  const [data, setData] = useState<FloorBoardEditor | null>(null);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [message, setMessage] = useState<{ kind: 'crit' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState({ from: '', to: '' });

  useEffect(() => {
    let live = true;
    floorBoardEditorAction(entityId)
      .then((d) => { if (!live) return; if (!d) { setMessage({ kind: 'crit', text: say('Ce tableau est indisponible.', 'This board is unavailable.') }); return; } setData(d); setDraft(toWorkflowDraft(d.workflow)); })
      .catch(() => live && setMessage({ kind: 'crit', text: say('Ce tableau est indisponible.', 'This board is unavailable.') }));
    return () => { live = false; };
  }, [entityId, say]);

  const preview = useMemo(() => (draft ? draftToWorkflow({ ...draft, stages: draft.stages.map((s, position) => ({ ...s, position })) }, entityId) : null), [draft, entityId]);
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
  // the moves the settings allow, as the custom list's starting point (positions from the draft's order)
  const fromSettings = (d: WorkflowDraft) => transitionsFromSettings(draftToWorkflow({ ...d, stages: d.stages.map((s, position) => ({ ...s, position })) }, entityId));
  const fill = () => edit((d) => ({ ...d, transitions: fromSettings(d) }));
  const setSetting = (key: keyof WorkflowSettings, on: boolean) => {
    // custom transitions turned on with nothing ticked would freeze every card: the list starts from the settings
    const empty = !active.some((s) => (draft.transitions[s.id] ?? []).length > 0);
    if (key === 'custom_transitions_enabled' && on && empty) {
      edit((d) => ({ ...d, custom_transitions_enabled: true, transitions: fromSettings(d) }));
      setMessage({ kind: 'info', text: say('La liste part des réglages ci-dessus : décochez ce qui ne doit pas être permis, puis enregistrez.', 'The list starts from the settings above: untick what must not be allowed, then save.') });
      return;
    }
    edit((d) => ({ ...d, [key]: on }));
  };
  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveFloorBoardAction(entityId, draft, data.workflow.updated_at);
      if (result.error) { setMessage({ kind: 'crit', text: result.error }); return; }
      const next = await floorBoardEditorAction(entityId);
      if (next) { setData(next); setDraft(toWorkflowDraft(next.workflow)); }
      setMessage({ kind: 'info', text: say("Tableau enregistré pour toutes les missions de l'étage. Aucune carte n'a été déplacée.", "Board saved for every mission of the floor. No card was moved.") });
      forgetWorkflows();
      await reload();
    } catch {
      setMessage({ kind: 'crit', text: say("Serveur injoignable : le tableau n'a pas changé.", 'Server unreachable: the board did not change.') });
    } finally {
      setSaving(false);
    }
  };
  // a move tried as someone who may complete the card, with a reason given: then whether it asks for one
  const testable = active.some((s) => s.id === test.from) && active.some((s) => s.id === test.to) && test.from !== test.to;
  const result = testable ? evaluateTransition(preview, test.from, test.to, 'motif') : null;
  const stranded = strandedStages(preview);
  const replaced = draft.custom_transitions_enabled;
  const reasonUseless = draft.require_reason && !replaced && !draft.allow_backward && !draft.allow_reopen;
  const takeModel = (model: Pick<WorkflowModel, 'stages' | 'settings'>, name: string) => {
    edit((d) => applyModel(d, model, data.cardCounts));
    const kept = draft.stages.filter((s) => !s.archived_at && (data.cardCounts[s.id] ?? 0) > 0 && !model.stages.some((m) => m.name.toLowerCase() === s.name.toLowerCase()));
    setMessage({ kind: 'info', text: say(`« ${name} » appliqué. Vérifiez puis enregistrez le tableau.`, `"${name}" applied. Check it, then save the board.`)
      + (kept.length ? say(` Gardées car elles ont des cartes : ${kept.map((s) => s.name).join(', ')}.`, ` Kept because they hold cards: ${kept.map((s) => s.name).join(', ')}.`) : '') });
  };
  const copy = async () => {
    const source = data.others.find((o) => o.id === copyFrom);
    if (!source) return;
    const board = await floorBoardSourceAction(copyFrom).catch(() => null);
    if (!board) { setMessage({ kind: 'crit', text: say('Ce tableau est indisponible.', 'That board is unavailable.') }); return; }
    takeModel(modelOfBoard(board), source.name);
    setCopyFrom('');
  };
  const floor = state.entities.find((e) => e.id === entityId);
  const missions = state.engagements.filter((e) => e.entityId === entityId && e.status !== 'completed').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="wf-floor">
        <div><b>{say(`Le tableau de ${floor?.name ?? "l'étage"}`, `${floor?.name ?? "The floor"}'s board`)}</b>
          <div className="small muted">{missions === 1
            ? say('Sa mission en cours le suit : une étape ajoutée ici y apparaît.', 'Its running mission follows it: a stage added here shows on it.')
            : say(`Ses ${missions} missions en cours le suivent toutes : une étape ajoutée ici apparaît sur chacune.`, `All its ${missions} running missions follow it: a stage added here shows on each of them.`)}</div></div>
      </div>
      {readOnly && <div className="banner warn">{say("Lecture seule : seuls l'administrateur et les managers de l'étage changent son tableau.", "Read-only: only the administrator and the floor's managers change its board.")}</div>}
      {message && <div className={`banner ${message.kind}`}>{message.text}</div>}

      {!readOnly && (
        <div className="card wf-start">
          <b>{say('Partir de', 'Start from')}</b>
          {WORKFLOW_MODELS.map((m) => (
            <button key={m.id} className="btn sm" onClick={() => takeModel(m, say(m.fr, m.en))} title={say(...m.hint)}>{say(m.fr, m.en)}</button>
          ))}
          <span className="small muted">{say('ou copier le tableau de', "or copy the board of")}</span>
          <Select className="in" style={{ width: 240 }} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">{say('un autre étage…', 'another floor…')}</option>
            {data.others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
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
                  <td><input type="radio" name={`default-${entityId}`} checked={s.is_default} disabled={readOnly} onChange={() => edit((d) => ({ ...d, stages: d.stages.map((x) => ({ ...x, is_default: x.id === s.id })) }))} aria-label={say('Par défaut', 'Default')} /></td>
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
        {SETTINGS.map(({ key, fr, en }) => {
          // with custom transitions, the list alone says which moves exist
          const off = replaced && (key === 'allow_backward' || key === 'allow_skip_forward' || key === 'allow_reopen');
          return (
            <label key={key} className={`wf-setting ${off ? 'off' : ''}`}>
              <input type="checkbox" checked={draft[key]} disabled={readOnly || off} onChange={(e) => setSetting(key, e.target.checked)} />
              <span><b>{say(fr[0], en[0])}</b><br /><span className="small muted">{off ? say('Remplacé par la liste des transitions personnalisées ci-dessous.', 'Replaced by the custom transition list below.') : say(fr[1], en[1])}</span></span>
            </label>
          );
        })}
        {reasonUseless && <div className="banner info">{say("Aucun retour en arrière ni aucune réouverture n'est permis : aucun motif ne sera demandé.", 'No move back nor reopening is allowed: no reason will be asked.')}</div>}
        {replaced && (
          <>
            <div className="wf-matrix-tools">
              <button className="btn sm" disabled={readOnly} onClick={fill}>{say('Repartir des réglages', 'Start again from the settings')}</button>
              <span className="small muted">{say('Ligne : depuis cette étape · colonne : vers. ', 'Row: from this stage · column: to. ')}<span className="wf-key back">↩</span> {say('retour', 'back')} · <span className="wf-key reopen">⟲</span> {say('réouverture', 'reopening')}{draft.require_reason ? say(' (un motif sera demandé)', ' (a reason will be asked)') : ''}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="wf-matrix">
                <thead><tr><th>{say('De ↓ · vers →', 'From ↓ · to →')}</th>{active.map((s) => <th key={s.id}>{s.name || '—'}</th>)}</tr></thead>
                <tbody>
                  {active.map((from, fi) => (
                    <tr key={from.id}>
                      <td><b>{from.name || '—'}</b></td>
                      {active.map((to, ti) => {
                        if (from.id === to.id) return <td key={to.id} className="wf-self">·</td>;
                        const kind = from.is_completed && !to.is_completed ? 'reopen' : ti < fi ? 'back' : '';
                        return (
                          <td key={to.id} className={kind}>
                            <label className="wf-cell">
                              <input type="checkbox" checked={(draft.transitions[from.id] ?? []).includes(to.id)} disabled={readOnly} onChange={() => toggle(from.id, to.id)} aria-label={`${from.name} → ${to.name}`} />
                              {kind && <span className={`wf-key ${kind}`}>{kind === 'reopen' ? '⟲' : '↩'}</span>}
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stranded.noWayOut.length > 0 && <div className="banner warn">{say(`Aucune carte ne pourra quitter : ${stranded.noWayOut.map((s) => s.name).join(', ')}.`, `No card will be able to leave: ${stranded.noWayOut.map((s) => s.name).join(', ')}.`)}</div>}
            {stranded.noWayIn.length > 0 && <div className="banner warn">{say(`Aucune carte ne pourra atteindre : ${stranded.noWayIn.map((s) => s.name).join(', ')}.`, `No card will be able to reach: ${stranded.noWayIn.map((s) => s.name).join(', ')}.`)}</div>}
          </>
        )}
      </div>

      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>{say('Essayer un déplacement', 'Try a move')}</b>
        <Select className="in" style={{ width: 180 }} value={test.from} onChange={(e) => setTest({ ...test, from: e.target.value })}><option value="">{say('de…', 'from…')}</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name || '—'}</option>)}</Select>
        <Select className="in" style={{ width: 180 }} value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })}><option value="">{say('vers…', 'to…')}</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name || '—'}</option>)}</Select>
        {result && (result.ok
          ? <Chip kind="good">{say('Permis', 'Allowed')}{(result.backward || result.reopen) && draft.require_reason ? say(' · un motif sera demandé', ' · a reason will be asked') : ''}</Chip>
          : <Chip kind="crit">{describeTransitionError(result.error, locale)}</Chip>)}
        {result && active.find((s) => s.id === test.to)?.is_completed && <span className="small muted">{say('Le passage à une étape terminée reste réservé au rapporteur du ticket.', "Moving to a completed stage stays the ticket's reporter's.")}</span>}
      </div>

      {!readOnly && <div className="actions"><button className="btn sm" disabled={!dirty || saving} onClick={() => setDraft(toWorkflowDraft(data.workflow))}>{say('Annuler les changements', 'Discard the changes')}</button><button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? say('Enregistrement…', 'Saving…') : say('Enregistrer le tableau', 'Save the board')}</button></div>}
    </div>
  );
}
