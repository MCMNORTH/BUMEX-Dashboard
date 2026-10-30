import { useEffect, useState } from 'react';
import { fmt } from '@bumex/domain';
import { financeArchiveAction, type FinanceArchive as Archive } from '@/lib/erp/vanguard/finance-actions';
import { Chip, D } from '../ui/common';
import { useSay } from './say';

// The Reports room's "Archives financières": BUMEX One's invoices, payments, transfers and bank statements, read-only
// (the ERP keeps the books since 2026-10-24). An invoice opens as its PDF.

type Part = 'invoices' | 'payments' | 'transfers' | 'statements';
const money = (amount: number, currency: string) => `${fmt(amount, 0)} ${currency}`;

export function FinanceArchive() {
  const say = useSay();
  const [data, setData] = useState<Archive | undefined>(undefined);
  const [part, setPart] = useState<Part>('invoices');
  const [q, setQ] = useState('');

  useEffect(() => {
    let live = true;
    financeArchiveAction().catch(() => null).then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, []);

  if (data === undefined) return <span className="muted">{say('Chargement…', 'Loading…')}</span>;
  if (data === null) return <div className="banner warn">{say("Les archives financières sont réservées à l'administrateur, aux managers et aux actionnaires.", 'The finance archive is for the administrator, managers and shareholders.')}</div>;
  const s = q.trim().toLowerCase();
  const match = (...values: (string | null | undefined)[]) => !s || values.filter(Boolean).join(' ').toLowerCase().includes(s);
  const parts: [Part, string, string, number][] = [['invoices', 'Factures', 'Invoices', data.invoices.length], ['payments', 'Paiements', 'Payments', data.payments.length], ['transfers', 'Virements', 'Transfers', data.transfers.length], ['statements', 'Relevés', 'Statements', data.statements.length]];

  return (
    <>
      <div className="banner info">{say("Les dossiers financiers de BUMEX One, en lecture seule : la comptabilité se tient désormais dans l'ERP (salles Clients, Fournisseurs, Trésorerie).", "BUMEX One's finance records, read-only: the books are now kept in the ERP (the Clients, Suppliers and Bank rooms).")}</div>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <div className="seg strip">{parts.map(([k, fr, en, n]) => <button key={k} className={`btn sm ${part === k ? 'on' : ''}`} onClick={() => setPart(k)}>{say(fr, en)} · {n}</button>)}</div>
        <input className="in" style={{ maxWidth: 260, marginLeft: 'auto' }} placeholder={say('Rechercher…', 'Search…')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card flush">
        {part === 'invoices' && (
          <table>
            <thead><tr><th>{say('Facture', 'Invoice')}</th><th>Client</th><th>{say('Émise', 'Issued')}</th><th>{say('Échéance', 'Due')}</th><th className="num">HT</th><th className="num">TVA</th><th className="num">TTC</th><th>{say('Statut', 'Status')}</th></tr></thead>
            <tbody>
              {data.invoices.filter((i) => match(i.number, i.client, i.project)).map((i) => (
                <tr key={i.id} className="click" onClick={() => window.open(`/api/invoices/${i.id}/pdf`, '_blank', 'noopener')}>
                  <td className="mono"><b>{i.number}</b>{i.project ? <div className="small muted">{i.project}</div> : null}</td><td className="small">{i.client ?? '—'}</td>
                  <td><D iso={i.issued.slice(0, 10)} /></td><td><D iso={i.due.slice(0, 10)} /></td>
                  <td className="num">{money(i.ht, i.currency)}</td><td className="num">{fmt(i.tax, 0)}</td><td className="num"><b>{money(i.ttc, i.currency)}</b></td>
                  <td><Chip kind={i.status === 'paid' ? 'good' : i.status === 'overdue' ? 'crit' : 'dim'}>{i.status}</Chip>{i.approved && <> <Chip kind="good">{say('validée', 'approved')}</Chip></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {part === 'payments' && (
          <table>
            <thead><tr><th>Client</th><th>{say('Facture', 'Invoice')}</th><th className="num">{say('Montant', 'Amount')}</th><th>{say('Date', 'Date')}</th><th>{say('Moyen', 'Method')}</th><th>{say('Référence', 'Reference')}</th><th>{say('Statut', 'Status')}</th></tr></thead>
            <tbody>
              {data.payments.filter((p) => match(p.client, p.invoice, p.reference)).map((p) => (
                <tr key={p.id}><td className="small">{p.client ?? '—'}</td><td className="mono small">{p.invoice ?? '—'}</td><td className="num"><b>{money(p.amount, p.currency)}</b></td><td><D iso={(p.date ?? p.due)?.slice(0, 10)} /></td><td className="small">{p.method}</td><td className="mono small">{p.reference ?? '—'}</td><td><Chip kind={p.status === 'received' || p.status === 'reconciled' ? 'good' : p.status === 'late' ? 'crit' : 'dim'}>{p.status}</Chip></td></tr>
              ))}
            </tbody>
          </table>
        )}
        {part === 'transfers' && (
          <table>
            <thead><tr><th>{say('Référence', 'Reference')}</th><th>{say('Bénéficiaire', 'Beneficiary')}</th><th className="num">{say('Montant', 'Amount')}</th><th>{say('Date', 'Date')}</th><th>{say('Catégorie', 'Category')}</th><th>{say('Statut', 'Status')}</th></tr></thead>
            <tbody>
              {data.transfers.filter((t) => match(t.reference, t.beneficiary, t.bank)).map((t) => (
                <tr key={t.id}><td className="mono small">{t.reference}</td><td><b>{t.beneficiary}</b>{t.bank ? <div className="small muted">{t.bank}</div> : null}</td><td className="num"><b>{money(t.amount, t.currency)}</b></td><td><D iso={t.date.slice(0, 10)} /></td><td className="small">{t.category}</td><td><Chip kind={t.status === 'confirmed' || t.status === 'sent' ? 'good' : t.status === 'failed' ? 'crit' : 'dim'}>{t.status}</Chip></td></tr>
              ))}
            </tbody>
          </table>
        )}
        {part === 'statements' && (
          <table>
            <thead><tr><th>{say('Relevé', 'Statement')}</th><th>{say('Compte', 'Account')}</th><th>{say('Date', 'Date')}</th><th className="num">{say('Lignes', 'Lines')}</th></tr></thead>
            <tbody>
              {data.statements.filter((b) => match(b.label, b.account)).map((b) => <tr key={b.id}><td><b>{b.label}</b></td><td className="small">{b.account} · {b.currency}</td><td><D iso={b.date.slice(0, 10)} /></td><td className="num">{b.lines}</td></tr>)}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
