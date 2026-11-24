import { useState } from 'react';
import { setAccountingOptions, setAccountMapping, settlementTolerance, findAccountByCode, EDITABLE_MAPPINGS, PARTNER_ROLES, parseAmount, type Id, type EditableMapping } from '@bumex/domain';
import { useStore } from '../store';
import { Field } from '../ui/common';
import { Suggest } from '../ui/Select';
import { useSay } from './say';

// [bumex-one] Comptabilité › Journaux · tiers, on Sidaty's corrections (2026-11-23; lib/erp/engine/chart.ts):
// - the entity's management rules: the tolerance of the small settlement differences the administrator decides, and
//   whether who prepared a supplier invoice may approve it (one accountant);
// - the accounts the new operations post to (BUMEX SA's set by migration 0021).

export function ManagementRules({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const entity = state.entities.find((e) => e.id === entityId);
  const func = entity?.functionalCurrency ?? 'MRU';
  const [tolerance, setTolerance] = useState(String(settlementTolerance(state, entityId)));
  const [preparer, setPreparer] = useState(!!entity?.preparerMayApprove);
  const allowed = PARTNER_ROLES.includes(state.session.role);
  const value = parseAmount(tolerance);
  return (
    <div className="card">
      <h2>{say('Règles de gestion', 'Management rules')}</h2>
      <Field label={say(`Seuil des écarts de règlement (${func})`, `Settlement difference threshold (${func})`)}><input className="in num" style={{ maxWidth: 160 }} value={tolerance} onChange={(e) => setTolerance(e.target.value)} disabled={!allowed} /></Field>
      <div className="small muted" style={{ marginTop: 4 }}>{say("Un reste dû ou un trop-perçu jusqu'à ce montant (ou sa contre-valeur) est proposé à l'administrateur dans Clients › Encaissements : en perte, en produit, ou laissé ouvert.", 'An amount still owed or overpaid up to this (or its equivalent) is proposed to the administrator in Clients › Receipts: as a loss, as income, or kept open.')}</div>
      <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
        <input type="checkbox" checked={preparer} onChange={(e) => setPreparer(e.target.checked)} disabled={!allowed} />
        {say('Le préparateur peut approuver ses factures fournisseurs (un seul comptable)', 'The preparer may approve their own supplier invoices (a single accountant)')}
      </label>
      <div className="small muted" style={{ marginTop: 4 }}>{say('Désactivé par défaut : la séparation des tâches reste la règle. Les seuils choisissent toujours qui approuve.', 'Off by default: separation of duties stays the rule. The thresholds still choose who approves.')}</div>
      <div className="actions" style={{ marginTop: 10 }}>
        {!allowed && <span className="small muted" style={{ marginRight: 'auto' }}>{say('Associé, RAF ou administrateur', 'Partner, finance manager or administrator')}</span>}
        <button className="btn primary" disabled={!allowed || value === null} onClick={() => apply((s) => setAccountingOptions(s, entityId, { settlementTolerance: value ?? undefined, preparerMayApprove: preparer }), say('Règles de gestion enregistrées', 'Management rules saved'))}>{say('Enregistrer', 'Save')}</button>
      </div>
    </div>
  );
}

const MAPPING_LABEL: Record<EditableMapping, [string, string, string, string]> = {
  TRANSFER_TRANSIT: ['Virements de fonds', 'Funds transfers', 'un virement interne entre deux devises y passe et le laisse à zéro', 'an internal transfer between two currencies goes through it and leaves it at zero'],
  FX_SALE_FEE: ['Commission de cession de devises', 'Currency-sale commission', "la perte d'une cession, si on la choisit en commission", 'the loss on a currency sale, when booked as a commission'],
  SETTLEMENT_LOSS: ['Écarts de règlement (perte)', 'Settlement differences (loss)', 'un reste dû passé en perte par l’administrateur', 'an amount still owed written off by the administrator'],
  SETTLEMENT_GAIN: ['Écarts de règlement (produit)', 'Settlement differences (income)', 'un trop-perçu passé en produit', 'an overpayment taken to income'],
};

export function CorrectionAccounts({ entityId }: { entityId: Id }) {
  const { state, apply } = useStore();
  const say = useSay();
  const allowed = PARTNER_ROLES.includes(state.session.role);
  const accounts = state.accounts.filter((a) => a.entityId === entityId && a.isPostable && a.active && !a.isAuxiliary).sort((a, b) => a.code.localeCompare(b.code));
  const options = accounts.map((a) => ({ value: a.code, label: `${a.code} ${a.nameFr}` }));
  const current = (key: EditableMapping) => { const m = state.mappings.find((x) => x.entityId === entityId && x.key === key && x.qualifier === ''); return m ? state.accounts.find((a) => a.id === m.accountId)?.code ?? '' : ''; };
  const [codes, setCodes] = useState<Record<EditableMapping, string>>(() => Object.fromEntries(EDITABLE_MAPPINGS.map((k) => [k, current(k)])) as Record<EditableMapping, string>);
  return (
    <div className="card">
      <h2>{say('Comptes de paramétrage', 'Account settings')}</h2>
      {EDITABLE_MAPPINGS.map((key) => {
        const a = findAccountByCode(state, entityId, codes[key].trim());
        const changed = codes[key].trim() !== current(key);
        return (
          <div key={key} style={{ marginTop: 8 }}>
            <Field label={say(MAPPING_LABEL[key][0], MAPPING_LABEL[key][1])}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 220 }}><Suggest className="in mono" recent="account-codes" options={options} value={codes[key]} onChange={(e) => setCodes({ ...codes, [key]: e.target.value })} aria-label={say(MAPPING_LABEL[key][0], MAPPING_LABEL[key][1])} placeholder={say('non paramétré', 'not set')} /></div>
                {changed && <button className="btn sm primary" disabled={!allowed || !a} onClick={() => a && apply((s) => setAccountMapping(s, entityId, key, a.id), say(`${MAPPING_LABEL[key][0]} → ${a.code}`, `${MAPPING_LABEL[key][1]} → ${a.code}`))}>{say('Enregistrer', 'Save')}</button>}
                <span className="small muted">{a ? a.nameFr : codes[key].trim() ? say('compte inconnu', 'unknown account') : ''}</span>
              </div>
            </Field>
            <div className="small muted">{say(MAPPING_LABEL[key][2], MAPPING_LABEL[key][3])}</div>
          </div>
        );
      })}
      {!allowed && <div className="small muted" style={{ marginTop: 8 }}>{say('Modifiable par un associé, le RAF ou l’administrateur', 'Editable by a partner, the finance manager or the administrator')}</div>}
    </div>
  );
}
