import { useState } from 'react';
import { activityReportAction, activityReportOptionsAction, defaultReportRangeAction } from '@/lib/erp/vanguard/report-actions';
import { frenchReportTypeLabels, reportTypeLabels } from '@/components/reports/report-type-selector';
import type { ReportBuilderData, ReportDocument, ReportType } from '@/types/report';
import { useStore } from '../store';
import { Field } from '../ui/common';
import { useSay } from './say';
import { Select } from '../ui/Select';
import { Loading, SkForm } from './skeleton';
import { useCached } from './cache';
import { POLICY } from './policies';

// The Reports room's second part: BUMEX One's activity reports (daily, weekly, team, mission, client, executive),
// next to Vanguard's financial reports (ui/panels/Reports.tsx).

type Options = ReportBuilderData & { me: string; canChoosePerson: boolean };

export function ActivityReports() {
  const { ui, toast } = useStore();
  const say = useSay();
  // the templates, people, missions and clients offered, kept between visits (one/policies.ts)
  const offered = useCached<Options>(['report-options'], () => activityReportOptionsAction(), POLICY.reportOptions);
  const options = offered.data ?? null;
  const [type, setType] = useState<ReportType | ''>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [userId, setUserId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [report, setReport] = useState<ReportDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [rangeOf, setRangeOf] = useState<ReportType | ''>('');
  const label = (t: ReportType) => (ui.lang === 'fr' ? frenchReportTypeLabels[t] : reportTypeLabels[t]);

  // the form starts on the person, the first mission, client and template, once the choices are read
  if (options && !seeded) {
    setSeeded(true);
    setUserId(options.me);
    setProjectId(options.projects[0]?.id ?? '');
    setClientId(options.clients[0]?.id ?? '');
    if (options.allowedTypes[0]) setType(options.allowedTypes[0]);
  }
  // each template has its own natural period (a day, a week, a month), put in the dates when the template changes (a
  // date typed afterwards stays: a later read of the same period does not put it back)
  const range = useCached(type ? ['report-range', type] : null, () => defaultReportRangeAction(type as ReportType), POLICY.reportOptions);
  if (type && range.data && rangeOf !== type) {
    setRangeOf(type);
    setStart(range.data.startDate);
    setEnd(range.data.endDate);
  }

  if (!options) return <Loading><div className="card sk-card"><SkForm fields={4} cols={2} /></div></Loading>;
  // generated on the button only (the press asks for it now), so read each time and not kept
  const generate = async () => {
    if (!type) return;
    setBusy(true);
    try {
      const result = await activityReportAction({ type, startDate: start, endDate: end, userId, projectId, clientId });
      if ('error' in result) toast('error', result.error);
      else setReport(result);
    } catch {
      toast('error', say('Le rapport n\'a pas pu être généré.', 'The report could not be generated.'));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!report) return;
    try { await navigator.clipboard.writeText(report.text); toast('ok', say('Rapport copié', 'Report copied')); } catch { toast('info', say('Copie impossible dans ce navigateur', 'Copy unavailable in this browser')); }
  };
  const needsProject = type === 'project_progress' || type === 'project_status';

  return (
    <>
      <div className="card">
        <div className="grid4">
          <Field label={say('Modèle', 'Template')} style={{ gridColumn: 'span 2' }}><Select className="in" value={type} onChange={(e) => { setType(e.target.value as ReportType); setReport(null); }}>{options.allowedTypes.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
          <Field label={say('Du', 'From')}><input className="in mono" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label={say('Au', 'To')}><input className="in mono" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          {options.canChoosePerson && !needsProject && type !== 'client_relationship' && (
            <Field label={say('Personne', 'Person')} style={{ gridColumn: 'span 2' }}><Select recent="people" className="in" value={userId} onChange={(e) => setUserId(e.target.value)}>{options.users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</Select></Field>
          )}
          {needsProject && (
            <Field label={say('Mission', 'Mission')} style={{ gridColumn: 'span 2' }}><Select recent="missions" className="in" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          )}
          {type === 'client_relationship' && (
            <Field label={say('Client', 'Client')} style={{ gridColumn: 'span 2' }}><Select recent="clients" className="in" value={clientId} onChange={(e) => setClientId(e.target.value)}>{options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          )}
        </div>
        <div className="actions" style={{ marginTop: 10 }}>
          {report && <button className="btn sm" onClick={copy}>{say('Copier le texte', 'Copy the text')}</button>}
          <button className="btn sm primary" disabled={busy || !type} onClick={generate}>{busy ? say('Génération…', 'Generating…') : say('Générer', 'Generate')}</button>
        </div>
      </div>
      {report && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>{report.title}</h2>
            <div className="small muted">{report.subtitle} · {report.scopeLabel}</div>
          </div>
          {report.summary && <div className="banner info">{report.summary}</div>}
          {report.sections.map((section) => (
            <div key={section.key}>
              <div className="caps muted" style={{ marginBottom: 4 }}>{section.title}</div>
              {section.items.length ? <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>{section.items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <span className="small muted">—</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
