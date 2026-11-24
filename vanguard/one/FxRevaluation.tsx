import { useMemo, useState } from 'react';
import { fxRevaluation, postFxRevaluation, statementBalanceAt, fmt, r2, type Id, type FxRevaluationRow } from '@bumex/domain';
import { useStore } from '../store';
import { Chip, D } from '../ui/common';
import { useSay } from './say';

// [bumex-one] Comptabilité › Clôture: the foreign currencies revalued at the fiscal year's last day (asked on 2026-11-17,
// lib/erp/engine/fx.ts): the foreign-currency bank accounts to 778 / 678, the invoices still open to the translation
// accounts 484 / 485, reversed on the next year's first day. A preview first; posted once.
const KIND = { bank: ['Compte bancaire', 'Bank account'], receivable: ['Créance client', 'Receivable'], payable: ['Dette fournisseur', 'Payable'] } as const;

export function FxRevaluationCard({ entityId, fiscalYearId }: { entityId: Id; fiscalYearId: Id }) {
  const { state, apply, openRoom } = useStore();
  const say = useSay();
  const [open, setOpen] = useState(false);
  const rv = useMemo(() => { try { return fxRevaluation(state, entityId, fiscalYearId); } catch { return null; } }, [state, entityId, fiscalYearId]);
  if (!rv || (!rv.rows.length && !rv.done)) return null; // nothing held or owed in a foreign currency
  const moving = rv.rows.filter((r) => r.diff !== 0);
  const conversion = rv.method === 'conversion_accounts';
  // where a row's difference goes: a gain or a loss for the bank accounts; for an open invoice, 485 (latent gain) or 484
  const target = (r: FxRevaluationRow) => {
    const gain = r.kind === 'payable' ? r.diff < 0 : r.diff > 0;
    if (r.kind === 'bank' || !conversion) return gain ? say('778 · gain de change', '778 · exchange gain') : say('678 · perte de change', '678 · exchange loss');
    return gain ? say('485 · écart passif', '485 · translation gain') : say('484 · écart actif', '484 · translation loss');
  };
  const effect = r2(rv.rows.reduce((a, r) => a + (r.kind === 'payable' ? -r.diff : r.diff), 0)); // + : the books gain
  // [bumex-one] a bank's balance in its currency beside its statement's on the same day (Sidaty, 2026-11-23): the
  // revaluation is only as right as the books' foreign balance
  const statementOf = (r: FxRevaluationRow) => (r.kind === 'bank' && r.bankAccountId ? statementBalanceAt(state, r.bankAccountId, rv.date) : null);
  const apart = rv.rows.filter((r) => { const st = statementOf(r); return st && Math.abs(st.balance - r.amountTxn) > 0.004; });
  const statementCell = (r: FxRevaluationRow) => {
    const st = statementOf(r);
    if (!st) return r.kind === 'bank' ? <span className="small muted">{say('aucun relevé', 'no statement')}</span> : '—';
    const differs = Math.abs(st.balance - r.amountTxn) > 0.004;
    return <span title={st.asOf !== rv.date ? say(`dernier relevé importé au ${st.asOf}`, `last statement imported on ${st.asOf}`) : undefined}>{differs ? <Chip kind="warn">{fmt(st.balance)}</Chip> : fmt(st.balance)}{st.asOf !== rv.date ? <span className="small muted"> · {st.asOf}</span> : null}</span>;
  };
  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b>{say('Réévaluation des devises au', 'Foreign currencies revalued at')} <D iso={rv.date} /></b>
        {rv.done ? <Chip kind="good">{say('comptabilisée', 'posted')}</Chip> : rv.missing.length ? <Chip kind="crit">{say('taux manquant', 'rate missing')} · {rv.missing.join(', ')}</Chip> : <Chip kind="warn">{say(`à faire · ${moving.length} élément(s)`, `to do · ${moving.length} item(s)`)}</Chip>}
        {!rv.done && !rv.missing.length && <span className="small muted">{say('écart net', 'net difference')} {fmt(effect)}</span>}
        {apart.length > 0 && <Chip kind="warn">{say(`${apart.length} banque(s) : livres ≠ relevé`, `${apart.length} bank(s): books ≠ statement`)}</Chip>}
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen((o) => !o)}>{open ? say('Masquer', 'Hide') : say('Détail', 'Details')}</button>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          {rv.missing.length > 0 && (
            <div className="banner warn" style={{ marginBottom: 8 }}>
              {say(`Pas de taux ${rv.missing.join(', ')} au ${rv.date} : `, `No ${rv.missing.join(', ')} rate at ${rv.date}: `)}
              <button className="btn sm" onClick={() => openRoom('settings', 'rates')}>{say('Saisir les taux', 'Enter the rates')}</button>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>{say('Nature', 'Kind')}</th><th>{say('Élément', 'Item')}</th><th className="num">{say('Montant', 'Amount')}</th><th className="num">{say('Relevé', 'Statement')}</th><th className="num">{say('Taux', 'Rate')}</th><th className="num">{say('Au livre', 'Book')}</th><th className="num">{say('Réévalué', 'Revalued')}</th><th className="num">{say('Écart', 'Difference')}</th><th>{say('Compte', 'Account')}</th></tr></thead>
              <tbody>
                {rv.rows.map((r, i) => (
                  <tr key={i} style={{ opacity: r.diff ? 1 : 0.55 }}>
                    <td className="small">{say(KIND[r.kind][0], KIND[r.kind][1])}</td><td>{r.label}</td><td className="num">{r.currency} {fmt(r.amountTxn)}</td><td className="num">{statementCell(r)}</td><td className="num">{r.rate || '—'}</td>
                    <td className="num">{fmt(r.book)}</td><td className="num">{fmt(r.revalued)}</td><td className="num">{fmt(r.diff)}</td><td className="small">{r.diff ? target(r) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            {say('Comptes bancaires en devises : écart en 778 (gain) ou 678 (perte), définitif. ', 'Foreign-currency bank accounts: the difference to 778 (gain) or 678 (loss), final. ')}
            {conversion
              ? say(`Factures encore ouvertes : écart de conversion en 484 / 485, contre-passé le ${rv.reversalDate ?? '1er janvier (exercice suivant à créer)'}.`, `Invoices still open: translation difference to 484 / 485, reversed on ${rv.reversalDate ?? '1 January (next year to create)'}.`)
              : say('Factures encore ouvertes : écart en 778 / 678 (méthode de l\'entité : en résultat).', 'Invoices still open: difference to 778 / 678 (the entity\'s method: to income).')}
          </div>
          {!rv.done && (
            <div className="actions" style={{ marginTop: 8 }}>
              <button className="btn primary" disabled={!!rv.missing.length || !moving.length} onClick={() => apply((s) => postFxRevaluation(s, entityId, fiscalYearId)[0], say(`Réévaluation au ${rv.date} comptabilisée`, `Revaluation at ${rv.date} posted`))}>{say('Comptabiliser la réévaluation', 'Post the revaluation')}</button>
            </div>
          )}
          {rv.done && <div className="small muted" style={{ marginTop: 6 }}>{say('Pour la refaire : extourner ses écritures (Comptabilité › écritures), puis comptabiliser à nouveau.', 'To redo it: reverse its entries, then post again.')}</div>}
        </div>
      )}
    </div>
  );
}
