import { useCallback, useEffect, useState } from 'react';
import { changeDocumentAction, saveDocumentAction } from '@/app/(app)/documents/actions';
import { documentsAction, type DocumentRow, type DocumentsData } from '@/lib/erp/vanguard/document-actions';
import type { DocumentRelatedType, DocumentType, DocumentVisibility } from '@/types/document';
import { useStore } from '../store';
import { Chip, Field, Icon } from '../ui/common';
import { type Say, when } from './Conversation';
import { useSay } from './say';
import { Select } from '../ui/Select';

// The Archives room's "Documents" tab: BUMEX One's documents (the files; the room's boxes are the paper). Upload,
// describe, link to a client, mission, contract or ticket, archive, restore, delete; download through BUMEX One's
// route. Saved by BUMEX One's document actions, under their rules.

const TYPES: Record<DocumentType, [string, string]> = {
  contract: ['Contrat', 'Contract'], invoice: ['Facture', 'Invoice'], receipt: ['Reçu', 'Receipt'], bank_transfer: ['Virement', 'Bank transfer'], proposal: ['Proposition', 'Proposal'],
  report: ['Rapport', 'Report'], meeting_note: ['Compte rendu', 'Meeting note'], technical_document: ['Document technique', 'Technical document'], legal_document: ['Document juridique', 'Legal document'], other: ['Autre', 'Other'],
};
const VISIBILITY: Record<DocumentVisibility, [string, string]> = { internal: ['Interne', 'Internal'], management: ['Direction', 'Management'], shareholders: ['Actionnaires', 'Shareholders'], restricted: ['Restreint', 'Restricted'] };
const LINKS: [DocumentRelatedType, string, string][] = [['client', 'Client', 'Client'], ['project', 'Mission', 'Mission'], ['contract', 'Contrat', 'Contract'], ['task', 'Ticket', 'Ticket']];
const size = (bytes: number) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`);

type Draft = { id: string; title: string; description: string; document_type: DocumentType; related_type: DocumentRelatedType; related_id: string; visibility: DocumentVisibility; file: File | null };

function DocumentForm({ draft, options, onDone, say }: { draft: Draft; options: NonNullable<DocumentsData>['options']; onDone: (saved: boolean) => void; say: Say }) {
  const { toast } = useStore();
  const [v, setV] = useState(draft);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setV((x) => ({ ...x, ...patch }));
  const targets: { id: string; label: string }[] = v.related_type === 'client' ? options.clients.map((c) => ({ id: c.id, label: c.name }))
    : v.related_type === 'project' ? options.projects.map((p) => ({ id: p.id, label: p.name }))
      : v.related_type === 'contract' ? options.contracts.map((c) => ({ id: c.id, label: c.title }))
        : options.tickets.map((t) => ({ id: t.id, label: t.title }));
  const save = async () => {
    const form = new FormData();
    for (const [k, value] of Object.entries({ title: v.title, description: v.description, document_type: v.document_type, related_type: v.related_type, related_id: v.related_id, visibility: v.visibility, ...(v.id ? { document_id: v.id } : {}) })) form.set(k, value);
    if (!v.id && v.file) form.set('file', v.file);
    setBusy(true);
    try {
      const result = await saveDocumentAction(form);
      if (result.error) { toast('error', result.error); return; }
      toast('ok', v.id ? say('Document mis à jour', 'Document updated') : say('Document déposé', 'Document uploaded'));
      onDone(true);
    } catch {
      toast('error', say("Serveur injoignable : le document n'est pas enregistré.", 'Server unreachable: the document was not saved.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0 }}>{v.id ? `${say('Modifier', 'Edit')} · ${draft.title}` : say('Déposer un document', 'Upload a document')}</h2>
      <div className="grid3">
        {!v.id && <Field label={say('Fichier', 'File')}><input className="in" type="file" onChange={(e) => { const file = e.target.files?.[0] ?? null; set({ file, title: v.title || (file?.name.replace(/\.[^.]+$/, '') ?? '') }); }} /></Field>}
        <Field label={say('Titre', 'Title')}><input className="in" value={v.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Type"><Select className="in" value={v.document_type} onChange={(e) => set({ document_type: e.target.value as DocumentType })}>{(Object.keys(TYPES) as DocumentType[]).map((k) => <option key={k} value={k}>{say(...TYPES[k])}</option>)}</Select></Field>
        <Field label={say('Lié à', 'Linked to')}><Select className="in" value={v.related_type} onChange={(e) => set({ related_type: e.target.value as DocumentRelatedType, related_id: '' })}>{LINKS.map(([k, fr, en]) => <option key={k} value={k}>{say(fr, en)}</option>)}</Select></Field>
        <Field label={say('Élément', 'Item')}><Select className="in" value={v.related_id} onChange={(e) => set({ related_id: e.target.value })}><option value="">{say('— choisir —', '— choose —')}</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
        <Field label={say('Visibilité', 'Visibility')}><Select className="in" value={v.visibility} onChange={(e) => set({ visibility: e.target.value as DocumentVisibility })}>{(Object.keys(VISIBILITY) as DocumentVisibility[]).map((k) => <option key={k} value={k}>{say(...VISIBILITY[k])}</option>)}</Select></Field>
      </div>
      <Field label="Description"><textarea className="in" style={{ height: 50, padding: 8 }} value={v.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <div className="actions"><button className="btn sm" onClick={() => onDone(false)} disabled={busy}>{say('Annuler', 'Cancel')}</button><button className="btn sm primary" disabled={busy || !v.title.trim() || !v.related_id || (!v.id && !v.file)} onClick={save}>{busy ? say('Envoi…', 'Sending…') : say('Enregistrer', 'Save')}</button></div>
    </div>
  );
}

export function DocumentsTab() {
  const say = useSay();
  const { toast } = useStore();
  const [data, setData] = useState<DocumentsData | undefined>(undefined);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [archived, setArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setData(await documentsAction().catch(() => null)), []);
  useEffect(() => {
    let live = true;
    documentsAction().catch(() => null).then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, []);

  if (data === undefined) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;
  if (data === null) return <div className="banner warn">{say("Les documents sont réservés à l'administrateur, aux managers et aux actionnaires.", 'Documents are for the administrator, managers and shareholders.')}</div>;
  const s = q.trim().toLowerCase();
  const rows = data.documents.filter((d) => d.is_archived === archived && (!type || d.document_type === type) && (!s || `${d.title} ${d.description ?? ''} ${d.file_name} ${d.relatedLabel}`.toLowerCase().includes(s)));
  const change = async (d: DocumentRow, what: 'archive' | 'restore' | 'delete') => {
    if (what === 'delete' && !window.confirm(say(`Supprimer « ${d.title} » ?`, `Delete "${d.title}"?`))) return;
    setBusy(true);
    try {
      const result = await changeDocumentAction(d.id, what);
      if (result.error) toast('error', result.error);
      else toast('ok', what === 'archive' ? say('Document archivé', 'Document archived') : what === 'restore' ? say('Document restauré', 'Document restored') : say('Document supprimé', 'Document deleted'));
      await load();
    } finally {
      setBusy(false);
    }
  };
  const editDraft = (d: DocumentRow): Draft => ({ id: d.id, title: d.title, description: d.description ?? '', document_type: d.document_type, related_type: d.related_type, related_id: d.related_id ?? '', visibility: d.visibility, file: null });

  return (
    <>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <input className="in" style={{ maxWidth: 280 }} placeholder={say('Rechercher un document…', 'Search for a document…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="in" style={{ width: 190 }} value={type} onChange={(e) => setType(e.target.value)}><option value="">{say('Tous les types', 'Every type')}</option>{(Object.keys(TYPES) as DocumentType[]).map((k) => <option key={k} value={k}>{say(...TYPES[k])}</option>)}</Select>
        <label className="small"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> {say('archivés', 'archived')}</label>
        {data.canManage && !draft && <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => setDraft({ id: '', title: '', description: '', document_type: 'report', related_type: 'project', related_id: '', visibility: 'internal', file: null })}><Icon name="upload" size={13} /> {say('Déposer', 'Upload')}</button>}
      </div>
      {draft && <DocumentForm key={draft.id || 'new'} draft={draft} options={data.options} onDone={(saved) => { setDraft(null); if (saved) void load(); }} say={say} />}
      <div className="card flush">
        <table>
          <thead><tr><th>Document</th><th>Type</th><th>{say('Lié à', 'Linked to')}</th><th>{say('Visibilité', 'Visibility')}</th><th className="num">{say('Taille', 'Size')}</th><th>{say('Mis à jour', 'Updated')}</th><th /></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td><b>{d.title}</b><div className="small muted">{d.file_name}{d.uploaderName ? ` · ${d.uploaderName}` : ''}</div></td>
                <td className="small">{say(...(TYPES[d.document_type] ?? TYPES.other))}</td>
                <td className="small">{d.relatedLabel}</td>
                <td><Chip kind={d.visibility === 'restricted' ? 'warn' : 'dim'}>{say(...(VISIBILITY[d.visibility] ?? VISIBILITY.internal))}</Chip></td>
                <td className="num small">{size(d.file_size)}</td>
                <td className="mono small">{when(d.updated_at)}</td>
                <td>
                  <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                    <a className="btn sm" href={`/api/documents/${d.id}/download`} target="_blank" rel="noreferrer"><Icon name="download" size={13} /></a>
                    {data.canManage && <button className="btn sm" onClick={() => setDraft(editDraft(d))}>{say('Modifier', 'Edit')}</button>}
                    {data.canManage && <button className="btn sm" disabled={busy} onClick={() => change(d, d.is_archived ? 'restore' : 'archive')}>{d.is_archived ? say('Restaurer', 'Restore') : say('Archiver', 'Archive')}</button>}
                    {data.canManage && <button className="btn sm ghost" disabled={busy} onClick={() => change(d, 'delete')} aria-label={say('Supprimer', 'Delete')}><Icon name="close" size={13} /></button>}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="muted" style={{ padding: 14 }}>{say('Aucun document.', 'No document.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
