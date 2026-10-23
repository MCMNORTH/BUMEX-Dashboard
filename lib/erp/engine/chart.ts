import type { State, Id, Account, AccountKind, AccountMapping, TaxCode, TaxRule, Journal, JournalKind, CoaTemplate, ThirdPartyRules, Customer, Supplier } from './types';
import { DomainError } from './types';
import { nextId, audit, requireRole, PARTNER_ROLES, normalizeCode, codeLength, mapped } from './core';

// Plan Comptable Mauritanien (ONEC) — the accounts the prototype's rooms use, from the pages you sent
// plus the balance-sheet accounts they post to. The full plan is seeded from your file in the next phase.
// [code, name, kind, statutory root?]
const PCM: [string, string, AccountKind, boolean?][] = [
  ['10', 'Capital', 'equity', true], ['101', 'Capital social', 'equity'],
  ['12', 'Report à nouveau', 'equity', true], ['120', 'Report à nouveau créditeur', 'equity'],
  ['13', 'Résultat de l\'exercice', 'equity', true], ['130', 'Résultat net bénéfice', 'equity'],
  ['19', 'Provisions pour risques et charges', 'liability', true], ['1905', 'Provision pour pertes de change', 'liability'],
  ['16', 'Emprunts et dettes assimilées', 'liability', true], ['162', 'Emprunts auprès des établissements de crédit', 'liability'], ['1688', 'Intérêts courus sur emprunts', 'liability'],
  ['20', 'Immobilisations incorporelles', 'asset', true], ['2050', 'Logiciels et licences', 'asset'],
  ['21', 'Immobilisations corporelles', 'asset', true], ['2181', 'Installations techniques et agencements', 'asset'], ['2182', 'Matériel de transport', 'asset'], ['2183', 'Matériel informatique', 'asset'], ['2184', 'Mobilier et matériel de bureau', 'asset'],
  ['28', 'Amortissements', 'asset', true], ['2805', 'Amortissement des logiciels', 'asset'], ['2811', 'Amortissement des installations et agencements', 'asset'], ['2812', 'Amortissement du matériel de transport', 'asset'], ['2814', 'Amortissement du matériel informatique', 'asset'], ['2815', 'Amortissement du mobilier', 'asset'],
  ['40', 'Fournisseurs et comptes rattachés', 'liability', true], ['4000', 'Fournisseurs ordinaires', 'liability'], ['4005', 'Fournisseurs, sociétés apparentées', 'liability'], ['408', 'Fournisseurs, factures à recevoir', 'liability'],
  ['41', 'Clients et comptes rattachés', 'asset', true], ['4100', 'Clients ordinaires', 'asset'], ['4105', 'Clients, sociétés apparentées', 'asset'], ['412', 'Clients douteux ou litigieux', 'asset'], ['418', 'Clients, factures à établir', 'asset'],
  ['42', 'Personnel', 'liability', true], ['421', 'Personnel, rémunérations dues', 'liability'], ['425', 'Personnel, avances et acomptes', 'asset'],
  ['43', 'État et collectivités publiques', 'liability', true], ['431', 'CNSS, cotisations à verser', 'liability'], ['432', 'CNAM, cotisations à verser', 'liability'], ['433', 'Impôts recouvrables sur les tiers (retenues à la source)', 'liability'], ['4340', 'État, ITS retenu sur salaires', 'liability'], ['4350', 'État, TVA déductible', 'asset'], ['4355', 'État, TVA à décaisser', 'liability'], ['4357', 'État, TVA collectée', 'liability'], ['4421', 'État, retenues à la source subies (à imputer)', 'asset'],
  ['45', 'Groupe et associés', 'liability', true], ['457', 'Comptes des sociétés du groupe', 'liability'],
  ['46', 'Débiteurs et créditeurs divers', 'asset', true], ['462', 'Créances sur cessions d\'immobilisations', 'asset'],
  ['48', 'Comptes de régularisation', 'asset', true], ['484', 'Différences de conversion, actif', 'asset'], ['485', 'Différences de conversion, passif', 'liability'], ['488', 'Comptes d\'attente et à régulariser', 'asset'],
  ['55', 'Banques', 'asset', true], ['5501', 'Banque, compte principal MRU', 'asset'], ['5502', 'Banque, compte USD', 'asset'], ['5503', 'Banque, compte EUR', 'asset'],
  ['56', 'Caisse', 'asset', true], ['560', 'Caisse siège', 'asset'],
  ['62', 'Charges externes liées à l\'investissement', 'expense', true], ['6200', 'Locations mobilières et immobilières', 'expense'], ['6230', 'Assurances multirisque', 'expense'],
  ['63', 'Charges externes liées à l\'activité', 'expense', true], ['6310', 'Voyages et déplacements', 'expense'], ['632', 'Frais postaux et télécommunications', 'expense'], ['6331', 'Honoraires', 'expense'], ['6333', 'Traitement automatique des informations', 'expense'], ['635', 'Services bancaires', 'expense'], ['638', 'Charges diverses', 'expense'],
  ['64', 'Charges et pertes diverses', 'expense', true], ['646', 'Créances irrécouvrables', 'expense'],
  ['65', 'Frais de personnel', 'expense', true], ['6500', 'Salaires, appointements', 'expense'], ['6510', 'Indemnités et primes', 'expense'], ['6520', 'Cotisations de sécurité sociale (CNSS)', 'expense'], ['6530', 'Cotisations d\'assurance maladie (CNAM)', 'expense'],
  ['66', 'Impôts, taxes et versements assimilés', 'expense', true], ['6601', 'Patente et droit de licence', 'expense'],
  ['67', 'Charges financières', 'expense', true], ['671', 'Intérêts des emprunts', 'expense'], ['673', 'Intérêts bancaires et sur opérations de financement', 'expense'], ['678', 'Différences de change (pertes)', 'expense'],
  ['68', 'Dotations aux amortissements et provisions', 'expense', true], ['680', 'Dotations aux amortissements', 'expense'], ['687', 'Dotations aux provisions pour risques et charges', 'expense'],
  ['70', 'Ventes, production vendue', 'income', true], ['7017', 'Prestations de services', 'income'], ['701711', 'Prestations de services exonérées à l\'intérieur', 'income'], ['701712', 'Exportations de prestations de services exonérées', 'income'], ['701713', 'Exportations de prestations de services imposables', 'income'], ['701721', 'Prestations de services soumises à taux réduit', 'income'], ['701722', 'Prestations de services soumises à taux normal', 'income'],
  ['77', 'Produits financiers', 'income', true], ['772', 'Revenus des comptes courants et des dépôts', 'income'], ['778', 'Différences de change (gains)', 'income'],
  ['78', 'Reprises sur amortissements et provisions', 'income', true], ['787', 'Reprises sur provisions pour risques et charges', 'income'],
  ['84', 'Résultats de cession d\'éléments de l\'actif', 'income', true], ['840', 'Plus-values de cession', 'income'], ['849', 'Moins-values de cession', 'expense'],
];

// Code Général de Normalisation Comptable (Morocco) — the same rooms, for BUMEX Maroc.
const CGNC: [string, string, AccountKind, boolean?][] = [
  ['11', 'Capitaux propres', 'equity', true], ['1111', 'Capital social', 'equity'], ['1161', 'Report à nouveau', 'equity'], ['1191', 'Résultat net de l\'exercice', 'equity'],
  ['14', 'Dettes de financement', 'liability', true], ['1481', 'Emprunts auprès des établissements de crédit', 'liability'],
  ['22', 'Immobilisations incorporelles', 'asset', true], ['2220', 'Brevets, marques, logiciels', 'asset'],
  ['23', 'Immobilisations corporelles', 'asset', true], ['2332', 'Matériel et outillage', 'asset'], ['2340', 'Matériel de transport', 'asset'], ['2351', 'Mobilier de bureau', 'asset'], ['2355', 'Matériel informatique', 'asset'], ['2356', 'Agencements, installations et aménagements', 'asset'],
  ['28', 'Amortissements des immobilisations', 'asset', true], ['2822', 'Amortissement des logiciels', 'asset'], ['28332', 'Amortissement du matériel et outillage', 'asset'], ['2834', 'Amortissement du matériel de transport', 'asset'], ['28351', 'Amortissement du mobilier', 'asset'], ['28355', 'Amortissement du matériel informatique', 'asset'], ['28356', 'Amortissement des agencements', 'asset'],
  ['34', 'Créances de l\'actif circulant', 'asset', true], ['3421', 'Clients', 'asset'], ['3453', 'Acomptes sur impôts (retenues à la source subies)', 'asset'], ['3424', 'Clients douteux ou litigieux', 'asset'], ['3427', 'Clients, factures à établir', 'asset'], ['34552', 'État, TVA récupérable sur charges', 'asset'], ['3461', 'Comptes d\'associés débiteurs', 'asset'], ['3497', 'Comptes transitoires ou d\'attente débiteurs', 'asset'], ['3701', 'Diminution des créances circulantes (écarts de conversion)', 'asset'],
  ['44', 'Dettes du passif circulant', 'liability', true], ['4411', 'Fournisseurs', 'liability'], ['4417', 'Fournisseurs, factures non parvenues', 'liability'], ['4432', 'Rémunérations dues au personnel', 'liability'], ['4441', 'CNSS', 'liability'], ['4443', 'Caisses de retraite et AMO', 'liability'], ['4452', 'État, impôts, taxes et assimilés (IR retenu)', 'liability'], ['4455', 'État, TVA facturée', 'liability'], ['4456', 'État, TVA due', 'liability'], ['4457', 'État, impôts et taxes à payer', 'liability'], ['4463', 'Comptes courants des associés créditeurs', 'liability'], ['4497', 'Comptes transitoires ou d\'attente créditeurs', 'liability'], ['4506', 'Provisions pour pertes de change', 'liability'], ['4701', 'Augmentation des dettes circulantes (écarts de conversion)', 'liability'],
  ['51', 'Trésorerie, actif', 'asset', true], ['5141', 'Banques (solde débiteur)', 'asset'], ['5161', 'Caisses', 'asset'],
  ['61', 'Charges d\'exploitation', 'expense', true], ['6131', 'Locations et charges locatives', 'expense'], ['61365', 'Honoraires', 'expense'], ['6147', 'Services bancaires', 'expense'], ['6171', 'Rémunérations du personnel', 'expense'], ['6174', 'Charges sociales', 'expense'], ['6192', 'Dotations aux amortissements des immobilisations incorporelles', 'expense'], ['6193', 'Dotations aux amortissements des immobilisations corporelles', 'expense'],
  ['63', 'Charges financières', 'expense', true], ['6311', 'Intérêts des emprunts et dettes', 'expense'], ['6331', 'Pertes de change propres à l\'exercice', 'expense'], ['6393', 'Dotations aux provisions pour risques et charges financiers', 'expense'],
  ['71', 'Produits d\'exploitation', 'income', true], ['7124', 'Ventes de services produits au Maroc', 'income'], ['7125', 'Ventes de services produits à l\'étranger', 'income'],
  ['73', 'Produits financiers', 'income', true], ['7331', 'Gains de change propres à l\'exercice', 'income'], ['7381', 'Intérêts et produits assimilés', 'income'], ['7393', 'Reprises sur provisions pour risques et charges financiers', 'income'],
];

// Système comptable OHADA révisé — for an entity set up in the OHADA zone (selectable as a template).
const SYSCOHADA: [string, string, AccountKind, boolean?][] = [
  ['10', 'Capital', 'equity', true], ['101', 'Capital social', 'equity'],
  ['12', 'Report à nouveau', 'equity', true], ['121', 'Report à nouveau créditeur', 'equity'],
  ['13', 'Résultat net de l\'exercice', 'equity', true], ['131', 'Résultat net : bénéfice', 'equity'],
  ['16', 'Emprunts et dettes assimilées', 'liability', true], ['162', 'Emprunts auprès des établissements de crédit', 'liability'],
  ['19', 'Provisions financières pour risques et charges', 'liability', true], ['194', 'Provisions pour pertes de change', 'liability'],
  ['21', 'Immobilisations incorporelles', 'asset', true], ['2131', 'Logiciels', 'asset'],
  ['23', 'Bâtiments, installations et agencements', 'asset', true], ['2381', 'Installations générales, agencements', 'asset'],
  ['24', 'Matériel, mobilier et actifs biologiques', 'asset', true], ['2441', 'Matériel et mobilier de bureau', 'asset'], ['2442', 'Matériel informatique', 'asset'], ['245', 'Matériel de transport', 'asset'],
  ['28', 'Amortissements', 'asset', true], ['2813', 'Amortissements des logiciels', 'asset'], ['2838', 'Amortissements des agencements', 'asset'], ['2841', 'Amortissements du matériel et mobilier de bureau', 'asset'], ['2842', 'Amortissements du matériel informatique', 'asset'], ['2845', 'Amortissements du matériel de transport', 'asset'],
  ['40', 'Fournisseurs et comptes rattachés', 'liability', true], ['401', 'Fournisseurs, dettes en compte', 'liability'], ['4081', 'Fournisseurs, factures non parvenues', 'liability'],
  ['41', 'Clients et comptes rattachés', 'asset', true], ['411', 'Clients', 'asset'], ['4162', 'Créances douteuses', 'asset'], ['4181', 'Clients, factures à établir', 'asset'],
  ['42', 'Personnel', 'liability', true], ['4211', 'Personnel, avances', 'asset'], ['422', 'Personnel, rémunérations dues', 'liability'],
  ['43', 'Organismes sociaux', 'liability', true], ['431', 'Sécurité sociale', 'liability'], ['432', 'Caisses de retraite et de santé', 'liability'],
  ['44', 'État et collectivités publiques', 'liability', true], ['4431', 'État, TVA facturée sur ventes', 'liability'], ['4441', 'État, TVA due', 'liability'], ['4454', 'État, TVA récupérable sur services', 'asset'], ['4472', 'Impôts sur salaires retenus', 'liability'], ['4474', 'Retenues à la source sur prestations', 'liability'], ['4494', 'État, retenues à la source subies', 'asset'],
  ['46', 'Associés et groupe', 'liability', true], ['462', 'Associés, comptes courants', 'liability'],
  ['47', 'Débiteurs et créditeurs divers', 'asset', true], ['471', 'Comptes d\'attente', 'asset'], ['4781', 'Écarts de conversion, actif', 'asset'], ['4782', 'Écarts de conversion, passif', 'liability'],
  ['48', 'Créances et dettes hors activités ordinaires', 'asset', true], ['485', 'Créances sur cessions d\'immobilisations', 'asset'],
  ['52', 'Banques', 'asset', true], ['521', 'Banques locales', 'asset'],
  ['57', 'Caisse', 'asset', true], ['571', 'Caisse siège', 'asset'],
  ['61', 'Transports', 'expense', true], ['6181', 'Voyages et déplacements', 'expense'],
  ['62', 'Services extérieurs A', 'expense', true], ['6221', 'Locations de terrains et bâtiments', 'expense'], ['6251', 'Assurances multirisques', 'expense'], ['6281', 'Frais de téléphone', 'expense'],
  ['63', 'Services extérieurs B', 'expense', true], ['6312', 'Frais sur effets et services bancaires', 'expense'], ['6324', 'Honoraires', 'expense'], ['6383', 'Charges diverses', 'expense'],
  ['65', 'Autres charges', 'expense', true], ['6511', 'Pertes sur créances clients', 'expense'],
  ['66', 'Charges de personnel', 'expense', true], ['6611', 'Appointements, salaires et commissions', 'expense'], ['6617', 'Indemnités et primes', 'expense'], ['6641', 'Charges sociales sur rémunérations', 'expense'], ['6648', 'Autres charges sociales', 'expense'],
  ['67', 'Frais financiers', 'expense', true], ['671', 'Intérêts des emprunts', 'expense'], ['6744', 'Intérêts bancaires', 'expense'], ['676', 'Pertes de change', 'expense'],
  ['68', 'Dotations aux amortissements', 'expense', true], ['6812', 'Dotations aux amortissements des immobilisations incorporelles', 'expense'], ['6813', 'Dotations aux amortissements des immobilisations corporelles', 'expense'],
  ['69', 'Dotations aux provisions', 'expense', true], ['6971', 'Dotations aux provisions financières', 'expense'],
  ['70', 'Ventes', 'income', true], ['7061', 'Services vendus, taxables', 'income'], ['7062', 'Services vendus, exonérés', 'income'], ['7063', 'Services vendus à l\'exportation', 'income'],
  ['77', 'Revenus financiers', 'income', true], ['7712', 'Intérêts et produits financiers', 'income'], ['776', 'Gains de change', 'income'],
  ['79', 'Reprises de provisions', 'income', true], ['7971', 'Reprises de provisions financières', 'income'],
  ['81', 'Valeurs comptables des cessions d\'immobilisations', 'expense', true], ['812', 'Valeurs comptables des cessions d\'immobilisations corporelles', 'expense'],
  ['82', 'Produits des cessions d\'immobilisations', 'income', true], ['822', 'Produits des cessions d\'immobilisations corporelles', 'income'],
];

export const CHART_TEMPLATES: { id: CoaTemplate; name: string; country: string; accounts: number }[] = [
  { id: 'PCM', name: 'Plan comptable mauritanien (ONEC)', country: 'MR', accounts: PCM.length },
  { id: 'CGNC', name: 'Code général de normalisation comptable (Maroc)', country: 'MA', accounts: CGNC.length },
  { id: 'SYSCOHADA', name: 'SYSCOHADA révisé (zone OHADA)', country: 'OHADA', accounts: SYSCOHADA.length },
];

function templateAccounts(template: CoaTemplate) {
  return template === 'PCM' ? PCM : template === 'CGNC' ? CGNC : SYSCOHADA;
}

// Template codes are presented on the entity's length (6 digits by default): "4100" becomes "410000". A code that is
// the prefix of another one in the template is a grouping (not postable) and keeps its short form; roots stay as they are.
function presentedAccounts(template: CoaTemplate, length: number): { orig: string; code: string; nameFr: string; kind: AccountKind; isRoot: boolean; grouping: boolean }[] {
  const src = templateAccounts(template);
  return src.map(([code, nameFr, kind, statutory]) => {
    const isRoot = !!statutory;
    const grouping = !isRoot && src.some(([other]) => other !== code && other.startsWith(code));
    return { orig: code, code: isRoot || grouping ? code : normalizeCode(code, length), nameFr, kind, isRoot, grouping };
  });
}

export function seedChart(state: State, entityId: Id, template: CoaTemplate): State {
  let s = state;
  const length = codeLength(state, entityId);
  const accounts: (Account & { orig: string })[] = [];
  for (const t of presentedAccounts(template, length)) {
    const [s1, id] = nextId(s, 'acc');
    s = s1;
    accounts.push({ id, entityId, code: t.code, nameFr: t.nameFr, kind: t.kind, isPostable: !t.isRoot && !t.grouping, isStatutory: t.isRoot, requiresCustomer: ['4100', '4105', '412', '3421', '411'].includes(t.orig), requiresSupplier: ['4000', '4005', '4411', '401'].includes(t.orig), active: true, orig: t.orig });
  }
  s = { ...s, accounts: [...s.accounts, ...accounts.map(({ orig: _o, ...a }) => a)] };
  const byCode = (c: string) => accounts.find((a) => a.orig === c)!.id;
  const map = (key: string, qualifier: string, code: string): AccountMapping => ({ entityId, key, qualifier, accountId: byCode(code) });
  const mappings: AccountMapping[] =
    template === 'SYSCOHADA'
      ? [
          map('AR_CONTROL', '', '411'), map('AR_GROUP', '', '411'), map('AR_DOUBTFUL', '', '4162'), map('AR_ACCRUAL', '', '4181'),
          map('AP_CONTROL', '', '401'), map('AP_GROUP', '', '401'), map('AP_ACCRUAL', '', '4081'),
          map('VAT_COLLECTED', '', '4431'), map('VAT_DEDUCTIBLE', '', '4454'), map('VAT_PAYABLE', '', '4441'), map('WHT_PAYABLE', '', '4474'),
          map('REVENUE', 'taxable_standard', '7061'), map('REVENUE', 'taxable_reduced', '7061'), map('REVENUE', 'exempt_domestic', '7062'), map('REVENUE', 'export_exempt', '7063'), map('REVENUE', 'export_taxable', '7063'),
          map('FX_GAIN', '', '776'), map('FX_LOSS', '', '676'), map('FX_CONV_ASSET', '', '4781'), map('FX_CONV_LIAB', '', '4782'), map('FX_PROV', '', '194'), map('FX_PROV_EXPENSE', '', '6971'), map('FX_PROV_REVERSAL', '', '7971'),
          map('BANK_FEES', '', '6312'), map('BANK_INTEREST_EXPENSE', '', '6744'), map('BANK_INTEREST_INCOME', '', '7712'), map('SUSPENSE', '', '471'), map('CASH', '', '571'),
          map('IC_CURRENT', '', '462'), map('RETAINED_EARNINGS', '', '121'), map('RESULT_PENDING', '', '131'),
          map('DEPR_EXPENSE', '', '6813'), map('DEPR_EXPENSE', 'SOFTWARE', '6812'), map('ACC_DEPR', 'IT', '2842'), map('ASSET', 'IT', '2442'), map('DISPOSAL_GAIN', '', '822'), map('DISPOSAL_LOSS', '', '812'), map('DISPOSAL_RECEIVABLE', '', '485'),
          map('ASSET', 'VEHICLE', '245'), map('ACC_DEPR', 'VEHICLE', '2845'), map('ASSET', 'FITTINGS', '2381'), map('ACC_DEPR', 'FITTINGS', '2838'), map('ASSET', 'FURNITURE', '2441'), map('ACC_DEPR', 'FURNITURE', '2841'), map('ASSET', 'SOFTWARE', '2131'), map('ACC_DEPR', 'SOFTWARE', '2813'),
          map('WHT_RECEIVABLE', '', '4494'), map('LOAN_PAYABLE', '', '162'), map('LOAN_INTEREST', '', '671'),
          map('SALARY_EXPENSE', '', '6611'), map('ALLOWANCE_EXPENSE', '', '6617'), map('SOCIAL_EXPENSE', '', '6641'), map('HEALTH_EXPENSE', '', '6648'), map('NET_PAYABLE', '', '422'), map('SOCIAL_PAYABLE', '', '431'), map('HEALTH_PAYABLE', '', '432'), map('TAX_WITHHELD_PAYABLE', '', '4472'),
        ]
      : template === 'PCM'
      ? [
          map('AR_CONTROL', '', '4100'), map('AR_GROUP', '', '4105'), map('AR_DOUBTFUL', '', '412'), map('AR_ACCRUAL', '', '418'),
          map('AP_CONTROL', '', '4000'), map('AP_GROUP', '', '4005'), map('AP_ACCRUAL', '', '408'),
          map('VAT_COLLECTED', '', '4357'), map('VAT_DEDUCTIBLE', '', '4350'), map('VAT_PAYABLE', '', '4355'), map('WHT_PAYABLE', '', '433'),
          map('REVENUE', 'taxable_standard', '701722'), map('REVENUE', 'taxable_reduced', '701721'), map('REVENUE', 'exempt_domestic', '701711'), map('REVENUE', 'export_exempt', '701712'), map('REVENUE', 'export_taxable', '701713'),
          map('FX_GAIN', '', '778'), map('FX_LOSS', '', '678'), map('FX_CONV_ASSET', '', '484'), map('FX_CONV_LIAB', '', '485'), map('FX_PROV', '', '1905'), map('FX_PROV_EXPENSE', '', '687'), map('FX_PROV_REVERSAL', '', '787'),
          map('BANK_FEES', '', '635'), map('BANK_INTEREST_EXPENSE', '', '673'), map('BANK_INTEREST_INCOME', '', '772'), map('SUSPENSE', '', '488'), map('CASH', '', '560'),
          map('IC_CURRENT', '', '457'), map('RETAINED_EARNINGS', '', '120'), map('RESULT_PENDING', '', '130'),
          map('DEPR_EXPENSE', '', '680'), map('ACC_DEPR', 'IT', '2814'), map('ASSET', 'IT', '2183'), map('DISPOSAL_GAIN', '', '840'), map('DISPOSAL_LOSS', '', '849'), map('DISPOSAL_RECEIVABLE', '', '462'),
          map('ASSET', 'VEHICLE', '2182'), map('ACC_DEPR', 'VEHICLE', '2812'), map('ASSET', 'FITTINGS', '2181'), map('ACC_DEPR', 'FITTINGS', '2811'), map('ASSET', 'FURNITURE', '2184'), map('ACC_DEPR', 'FURNITURE', '2815'), map('ASSET', 'SOFTWARE', '2050'), map('ACC_DEPR', 'SOFTWARE', '2805'),
          map('WHT_RECEIVABLE', '', '4421'), map('LOAN_PAYABLE', '', '162'), map('LOAN_INTEREST', '', '671'),
          map('SALARY_EXPENSE', '', '6500'), map('ALLOWANCE_EXPENSE', '', '6510'), map('SOCIAL_EXPENSE', '', '6520'), map('HEALTH_EXPENSE', '', '6530'), map('NET_PAYABLE', '', '421'), map('SOCIAL_PAYABLE', '', '431'), map('HEALTH_PAYABLE', '', '432'), map('TAX_WITHHELD_PAYABLE', '', '4340'),
        ]
      : [
          map('AR_CONTROL', '', '3421'), map('AR_GROUP', '', '3421'), map('AR_DOUBTFUL', '', '3424'), map('AR_ACCRUAL', '', '3427'),
          map('AP_CONTROL', '', '4411'), map('AP_GROUP', '', '4411'), map('AP_ACCRUAL', '', '4417'),
          map('VAT_COLLECTED', '', '4455'), map('VAT_DEDUCTIBLE', '', '34552'), map('VAT_PAYABLE', '', '4456'), map('WHT_PAYABLE', '', '4457'),
          map('REVENUE', 'taxable_standard', '7124'), map('REVENUE', 'taxable_reduced', '7124'), map('REVENUE', 'exempt_domestic', '7124'), map('REVENUE', 'export_exempt', '7125'), map('REVENUE', 'export_taxable', '7125'),
          map('FX_GAIN', '', '7331'), map('FX_LOSS', '', '6331'), map('FX_CONV_ASSET', '', '3701'), map('FX_CONV_LIAB', '', '4701'), map('FX_PROV', '', '4506'), map('FX_PROV_EXPENSE', '', '6393'), map('FX_PROV_REVERSAL', '', '7393'),
          map('BANK_FEES', '', '6147'), map('BANK_INTEREST_EXPENSE', '', '6311'), map('BANK_INTEREST_INCOME', '', '7381'), map('SUSPENSE', '', '3497'), map('CASH', '', '5161'),
          map('IC_CURRENT', '', '4463'), map('RETAINED_EARNINGS', '', '1161'), map('RESULT_PENDING', '', '1191'),
          map('DEPR_EXPENSE', '', '6193'), map('DEPR_EXPENSE', 'SOFTWARE', '6192'), map('ACC_DEPR', 'IT', '28355'), map('ASSET', 'IT', '2355'),
          map('ASSET', 'VEHICLE', '2340'), map('ACC_DEPR', 'VEHICLE', '2834'), map('ASSET', 'FITTINGS', '2356'), map('ACC_DEPR', 'FITTINGS', '28356'), map('ASSET', 'FURNITURE', '2351'), map('ACC_DEPR', 'FURNITURE', '28351'), map('ASSET', 'SOFTWARE', '2220'), map('ACC_DEPR', 'SOFTWARE', '2822'),
          map('WHT_RECEIVABLE', '', '3453'), map('LOAN_PAYABLE', '', '1481'), map('LOAN_INTEREST', '', '6311'),
          map('SALARY_EXPENSE', '', '6171'), map('ALLOWANCE_EXPENSE', '', '6171'), map('SOCIAL_EXPENSE', '', '6174'), map('HEALTH_EXPENSE', '', '6174'), map('NET_PAYABLE', '', '4432'), map('SOCIAL_PAYABLE', '', '4441'), map('HEALTH_PAYABLE', '', '4443'), map('TAX_WITHHELD_PAYABLE', '', '4452'),
        ];
  s = { ...s, mappings: [...s.mappings, ...mappings] };

  // Tax codes and rules. Rates: your answer (16 % Mauritania, 20 % Morocco, 0 % GTA and other special regimes).
  const vatRate = template === 'CGNC' ? 0.2 : template === 'SYSCOHADA' ? 0.18 : 0.16;
  const collected = byCode(template === 'PCM' ? '4357' : template === 'CGNC' ? '4455' : '4431');
  const deductible = byCode(template === 'PCM' ? '4350' : template === 'CGNC' ? '34552' : '4454');
  const wht = byCode(template === 'PCM' ? '433' : template === 'CGNC' ? '4457' : '4474');
  const whtReceivable = byCode(template === 'PCM' ? '4421' : template === 'CGNC' ? '3453' : '4494');
  const codes: Omit<TaxCode, 'id'>[] = [
    { entityId, code: `TVA-${Math.round(vatRate * 100)}`, nameFr: `TVA ${Math.round(vatRate * 100)} %`, kind: 'vat', rate: vatRate, collectedAccountId: collected, deductibleAccountId: deductible, revenueStatus: 'taxable_standard' },
    { entityId, code: 'GTA-EXO', nameFr: 'Exonération régime GTA 0 %', kind: 'vat', rate: 0, collectedAccountId: collected, revenueStatus: 'exempt_domestic', legalMentionFr: 'Prestation exonérée de TVA — sous-traitant enregistré au régime fiscal du projet GTA' },
    { entityId, code: 'EXO', nameFr: 'Exonération 0 %', kind: 'vat', rate: 0, collectedAccountId: collected, revenueStatus: 'exempt_domestic', legalMentionFr: 'Prestation exonérée de TVA' },
    { entityId, code: 'EXP-0', nameFr: 'Exportation de services 0 %', kind: 'vat', rate: 0, collectedAccountId: collected, revenueStatus: 'export_exempt', legalMentionFr: 'Exportation de services — TVA 0 %' },
    { entityId, code: 'RAS-3', nameFr: 'Retenue à la source honoraires 3 % (fournisseurs)', kind: 'withholding', rate: 0.03, collectedAccountId: wht },
    { entityId, code: 'RAS-15', nameFr: 'Retenue à la source non-résidents 15 % (fournisseurs)', kind: 'withholding', rate: 0.15, collectedAccountId: wht },
    { entityId, code: 'RAS-7', nameFr: 'Retenue à la source 7 % sur prestations (subie, client)', kind: 'withholding', rate: 0.07, deductibleAccountId: whtReceivable, legalMentionFr: 'Prestation soumise à la retenue à la source de 7 % — le client retient et reverse au Trésor' },
  ];
  const taxCodes: TaxCode[] = [];
  for (const c of codes) {
    const [s1, id] = nextId(s, 'tax');
    s = s1;
    taxCodes.push({ ...c, id });
  }
  const tc = (code: string) => taxCodes.find((t) => t.code === code)!.id;
  const rules: TaxRule[] = [
    { entityId, regime: null, serviceCategory: null, taxCodeId: tc(`TVA-${Math.round(vatRate * 100)}`), priority: 100 },
    { entityId, regime: 'gta', serviceCategory: null, taxCodeId: tc('GTA-EXO'), priority: 100 },
    { entityId, regime: 'exempt', serviceCategory: null, taxCodeId: tc('EXO'), priority: 100 },
    { entityId, regime: 'public', serviceCategory: null, taxCodeId: tc('EXO'), priority: 100 },
    { entityId, regime: 'non_resident', serviceCategory: null, taxCodeId: tc('EXP-0'), priority: 100 },
  ];
  s = { ...s, taxCodes: [...s.taxCodes, ...taxCodes], taxRules: [...s.taxRules, ...rules] };

  const journals: Journal[] = [];
  for (const [code, name, kind] of [['VT', 'Ventes', 'sales'], ['AC', 'Achats', 'purchases'], ['BQ', 'Banque', 'bank'], ['CA', 'Caisse', 'cash'], ['OD', 'Opérations diverses', 'misc'], ['IM', 'Immobilisations', 'assets'], ['CL', 'Clôture', 'closing']] as const) {
    const [s1, id] = nextId(s, 'jnl');
    s = s1;
    journals.push({ id, entityId, code, name, kind });
  }
  s = { ...s, journals: [...s.journals, ...journals] };
  s = { ...s, bankRules: [...s.bankRules, { entityId, pattern: 'FRAIS|COMMISSION|TENUE DE COMPTE', mappingKey: 'BANK_FEES', label: 'Règle : services bancaires' }, { entityId, pattern: 'AGIOS|INTERETS DEB', mappingKey: 'BANK_INTEREST_EXPENSE', label: 'Règle : intérêts bancaires' }, { entityId, pattern: 'INTERETS CRED|REMUNERATION DEPOT', mappingKey: 'BANK_INTEREST_INCOME', label: 'Règle : produits financiers' }, { entityId, pattern: 'VIR INTERNE|VIREMENT INTERNE', mappingKey: 'TRANSFER', label: 'Virement interne' }] };
  return s;
}

export function addAccount(state: State, entityId: Id, code: string, nameFr: string, kind: AccountKind): [State, Account] {
  if (!/^\d{3,8}$/.test(code.trim())) throw new DomainError('code', 'Le numéro doit avoir 3 à 8 chiffres (les racines à 2 chiffres sont réservées au référentiel)');
  const full = normalizeCode(code, codeLength(state, entityId));
  if (state.accounts.some((a) => a.entityId === entityId && (a.code === full || a.code === code.trim()))) throw new DomainError('exists', `Le compte ${full} existe déjà`);
  if (!nameFr.trim()) throw new DomainError('name', "L'intitulé est obligatoire");
  const [s1, id] = nextId(state, 'acc');
  const a: Account = { id, entityId, code: full, nameFr: nameFr.trim(), kind, isPostable: true, isStatutory: false, active: true };
  return [audit({ ...s1, accounts: [...s1.accounts, a] }, 'account', id, 'I', `Compte ${a.code} ${a.nameFr}`, entityId), a];
}

// ---- journals: free to create, rename and retype; a journal carrying posted entries is kept ---------------------

export const JOURNAL_KINDS: { id: JournalKind; name: string }[] = [
  { id: 'sales', name: 'Ventes' }, { id: 'purchases', name: 'Achats' }, { id: 'bank', name: 'Banque' }, { id: 'cash', name: 'Caisse' }, { id: 'misc', name: 'Opérations diverses' }, { id: 'assets', name: 'Immobilisations' }, { id: 'closing', name: 'Clôture' },
];

export function addJournal(state: State, input: { entityId: Id; code: string; name: string; kind: JournalKind }): [State, Journal] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de paramétrer les journaux');
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(code)) throw new DomainError('code', 'Code de journal : 1 à 6 lettres ou chiffres');
  if (!input.name.trim()) throw new DomainError('name', "L'intitulé est obligatoire");
  if (!JOURNAL_KINDS.some((k) => k.id === input.kind)) throw new DomainError('kind', 'Type de journal inconnu');
  if (state.journals.some((j) => j.entityId === input.entityId && j.code === code)) throw new DomainError('exists', `Le journal ${code} existe déjà`);
  const [s1, id] = nextId(state, 'jnl');
  const j: Journal = { id, entityId: input.entityId, code, name: input.name.trim(), kind: input.kind };
  return [audit({ ...s1, journals: [...s1.journals, j] }, 'journal', id, 'I', `Journal ${code} · ${j.name}`, input.entityId), j];
}

export function updateJournal(state: State, id: Id, patch: Partial<Pick<Journal, 'code' | 'name' | 'kind'>>): [State, Journal] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de paramétrer les journaux');
  const j = state.journals.find((x) => x.id === id);
  if (!j) throw new DomainError('not_found', 'Journal inconnu');
  const next: Journal = { ...j, ...patch, code: (patch.code ?? j.code).trim().toUpperCase(), name: (patch.name ?? j.name).trim() };
  if (!/^[A-Z0-9]{1,6}$/.test(next.code)) throw new DomainError('code', 'Code de journal : 1 à 6 lettres ou chiffres');
  if (!next.name) throw new DomainError('name', "L'intitulé est obligatoire");
  if (state.journals.some((x) => x.id !== id && x.entityId === j.entityId && x.code === next.code)) throw new DomainError('exists', `Le journal ${next.code} existe déjà`);
  const used = state.entries.some((e) => e.journalId === id && e.status !== 'draft');
  if (used && patch.kind && patch.kind !== j.kind) throw new DomainError('in_use', `Le journal ${j.code} porte des écritures comptabilisées : son type ne change plus (code et intitulé restent modifiables)`);
  return [audit({ ...state, journals: state.journals.map((x) => (x.id === id ? next : x)) }, 'journal', id, 'U', `Journal ${j.code} → ${next.code} · ${next.name} · ${next.kind}`, j.entityId), next];
}

export function journalUsage(state: State, id: Id): { posted: number; drafts: number; banks: number; loans: number } {
  return { posted: state.entries.filter((e) => e.journalId === id && e.status !== 'draft').length, drafts: state.entries.filter((e) => e.journalId === id && e.status === 'draft').length, banks: state.bankAccounts.filter((b) => b.journalId === id).length, loans: state.loans.filter((l) => l.journalId === id).length };
}

export function deleteJournal(state: State, id: Id): State {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de supprimer un journal');
  const j = state.journals.find((x) => x.id === id);
  if (!j) throw new DomainError('not_found', 'Journal inconnu');
  const u = journalUsage(state, id);
  if (u.posted) throw new DomainError('in_use', `Le journal ${j.code} porte ${u.posted} écriture(s) comptabilisée(s) : conservation obligatoire, il ne peut pas être supprimé`);
  if (u.drafts) throw new DomainError('in_use', `Le journal ${j.code} porte ${u.drafts} brouillon(s) : les supprimer ou les déplacer d'abord`);
  if (u.banks) throw new DomainError('in_use', `Le journal ${j.code} est le journal de ${u.banks} compte(s) bancaire(s)`);
  if (u.loans) throw new DomainError('in_use', `Le journal ${j.code} est le journal de ${u.loans} emprunt(s)`);
  return audit({ ...state, journals: state.journals.filter((x) => x.id !== id) }, 'journal', id, 'D', `Journal ${j.code} supprimé`, j.entityId);
}

// ---- chart views: the main view shows the accounts that carry entries; the rest sits in a secondary view -----------

export interface ChartViewRow {
  account: Account;
  debit: number;
  credit: number;
  balance: number;
  entries: number;
  collective?: Account; // for an auxiliary account
}

export function chartView(state: State, entityId: Id, view: 'moving' | 'all' | 'unused' | 'auxiliary'): ChartViewRow[] {
  const sums = new Map<Id, { d: number; c: number; n: number }>();
  const byId = new Map(state.accounts.map((a) => [a.id, a] as const));
  const add = (id: Id, l: { debit: number; credit: number }) => {
    const x = sums.get(id) ?? { d: 0, c: 0, n: 0 };
    x.d += l.debit; x.c += l.credit; x.n += 1;
    sums.set(id, x);
  };
  for (const e of state.entries) {
    if (e.entityId !== entityId || e.status === 'draft') continue;
    for (const l of e.lines) {
      add(l.accountId, l);
      // the movements of an auxiliary account also count on its collective, which is what the main view shows
      const col = byId.get(l.accountId)?.collectiveId;
      if (col) add(col, l);
    }
  }
  const rows: ChartViewRow[] = state.accounts
    .filter((a) => a.entityId === entityId)
    .map((a) => { const x = sums.get(a.id) ?? { d: 0, c: 0, n: 0 }; return { account: a, debit: Math.round(x.d * 100) / 100, credit: Math.round(x.c * 100) / 100, balance: Math.round((x.d - x.c) * 100) / 100, entries: x.n, collective: a.collectiveId ? state.accounts.find((c) => c.id === a.collectiveId) : undefined }; });
  const pick = (r: ChartViewRow) => {
    if (view === 'auxiliary') return !!r.account.isAuxiliary;
    if (r.account.isAuxiliary) return false;
    if (view === 'all') return true;
    if (view === 'moving') return r.entries > 0 && r.account.isPostable;
    return r.entries === 0 || !r.account.isPostable; // unused, groupings, roots, inactive
  };
  return rows.filter(pick).sort((a, b) => a.account.code.localeCompare(b.account.code));
}

// ---- auxiliary accounting: third-party codes and their accounts under the collectives ---------------------------

export const DEFAULT_THIRD_PARTY_RULES: ThirdPartyRules = { customerPrefix: 'C', supplierPrefix: 'F', digits: 3 };

export function thirdPartyRulesFor(state: State, entityId: Id): ThirdPartyRules {
  const e = state.entities.find((x) => x.id === entityId);
  return { ...DEFAULT_THIRD_PARTY_RULES, ...(e?.thirdPartyRules ?? {}) };
}

export function setThirdPartyRules(state: State, entityId: Id, rules: Partial<ThirdPartyRules>): State {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], 'de paramétrer les tiers');
  const next = { ...thirdPartyRulesFor(state, entityId), ...rules };
  if (!/^[A-Z0-9]{0,4}$/i.test(next.customerPrefix) || !/^[A-Z0-9]{0,4}$/i.test(next.supplierPrefix)) throw new DomainError('prefix', 'Préfixe : 0 à 4 lettres ou chiffres');
  if (!(next.digits >= 2 && next.digits <= 6)) throw new DomainError('digits', 'Nombre de chiffres entre 2 et 6');
  for (const id of [next.customerCollectiveId, next.supplierCollectiveId]) {
    if (!id) continue;
    const a = state.accounts.find((x) => x.id === id && x.entityId === entityId);
    if (!a || !a.active || a.isAuxiliary) throw new DomainError('collective', 'Compte collectif inconnu ou inactif');
  }
  return audit({ ...state, entities: state.entities.map((e) => (e.id === entityId ? { ...e, thirdPartyRules: next } : e)) }, 'entity', entityId, 'U', `Règles de numérotation des tiers · clients ${next.customerPrefix}${'0'.repeat(next.digits)} · fournisseurs ${next.supplierPrefix}${'0'.repeat(next.digits)}`, entityId);
}

export function collectiveFor(state: State, entityId: Id, kind: 'customer' | 'supplier', group = false): Account {
  const rules = thirdPartyRulesFor(state, entityId);
  const own = kind === 'customer' ? rules.customerCollectiveId : rules.supplierCollectiveId;
  const a = own ? state.accounts.find((x) => x.id === own && x.active) : undefined;
  if (a && !group) return a;
  return mapped(state, entityId, kind === 'customer' ? (group ? 'AR_GROUP' : 'AR_CONTROL') : group ? 'AP_GROUP' : 'AP_CONTROL');
}

// Next free code for a third party: prefix + zero-padded sequence, skipping codes already taken (custom ones included).
export function nextThirdPartyCode(state: State, entityId: Id, kind: 'customer' | 'supplier'): string {
  const rules = thirdPartyRulesFor(state, entityId);
  const prefix = kind === 'customer' ? rules.customerPrefix : rules.supplierPrefix;
  const taken = new Set((kind === 'customer' ? state.customers : state.suppliers).filter((t) => t.entityId === entityId).map((t) => t.code.toUpperCase()));
  for (let n = 1; n < 10 ** rules.digits; n++) {
    const code = `${prefix}${String(n).padStart(rules.digits, '0')}`.toUpperCase();
    if (!taken.has(code)) return code;
  }
  throw new DomainError('codes', 'Plus de code disponible : augmenter le nombre de chiffres');
}

export function checkThirdPartyCode(state: State, entityId: Id, kind: 'customer' | 'supplier', code: string, selfId?: Id): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,11}$/.test(c)) throw new DomainError('code', 'Code tiers : 2 à 12 caractères (lettres, chiffres, . _ -)');
  const list = kind === 'customer' ? state.customers : state.suppliers;
  if (list.some((t) => t.entityId === entityId && t.id !== selfId && t.code.toUpperCase() === c)) throw new DomainError('exists', `Le code ${c} existe déjà pour un ${kind === 'customer' ? 'client' : 'fournisseur'}`);
  if (state.accounts.some((a) => a.entityId === entityId && a.isAuxiliary && a.code === c && !(kind === 'customer' ? state.customers : state.suppliers).some((t) => t.id === selfId && (kind === 'customer' ? (t as Customer).arAccountId : (t as Supplier).apAccountId) === a.id))) throw new DomainError('exists', `Un compte auxiliaire ${c} existe déjà`);
  return c;
}

// The auxiliary account of a third party: created under the collective, named after the party, carrying its code.
export function ensureAuxiliaryAccount(state: State, entityId: Id, kind: 'customer' | 'supplier', party: { id: Id; code: string; name: string; groupEntityId?: Id }, collectiveId?: Id): [State, Account] {
  const existing = kind === 'customer' ? state.customers.find((c) => c.id === party.id)?.arAccountId : state.suppliers.find((c) => c.id === party.id)?.apAccountId;
  const found = existing ? state.accounts.find((a) => a.id === existing) : undefined;
  if (found) return [state, found];
  const collective = collectiveId ? state.accounts.find((a) => a.id === collectiveId && a.entityId === entityId && a.active && !a.isAuxiliary) : collectiveFor(state, entityId, kind, !!party.groupEntityId);
  if (!collective) throw new DomainError('collective', 'Compte collectif inconnu ou inactif');
  const [s1, id] = nextId(state, 'acc');
  const a: Account = { id, entityId, code: party.code.toUpperCase(), nameFr: party.name, kind: collective.kind, isPostable: true, isStatutory: false, requiresCustomer: kind === 'customer', requiresSupplier: kind === 'supplier', active: true, isAuxiliary: true, collectiveId: collective.id };
  const s: State = kind === 'customer'
    ? { ...s1, accounts: [...s1.accounts, a], customers: s1.customers.map((c) => (c.id === party.id ? { ...c, arAccountId: id } : c)) }
    : { ...s1, accounts: [...s1.accounts, a], suppliers: s1.suppliers.map((c) => (c.id === party.id ? { ...c, apAccountId: id } : c)) };
  return [s, a];
}

// Re-attach a third party's auxiliary account to another collective (sheet edit); the account's code follows the party's.
export function attachAuxiliary(state: State, accountId: Id, collectiveId: Id): State {
  const a = state.accounts.find((x) => x.id === accountId && x.isAuxiliary);
  if (!a) throw new DomainError('not_found', 'Compte auxiliaire inconnu');
  const c = state.accounts.find((x) => x.id === collectiveId && x.entityId === a.entityId && x.active && !x.isAuxiliary);
  if (!c) throw new DomainError('collective', 'Compte collectif inconnu ou inactif');
  return audit({ ...state, accounts: state.accounts.map((x) => (x.id === accountId ? { ...x, collectiveId: c.id, kind: c.kind } : x)) }, 'account', accountId, 'U', `Compte auxiliaire ${a.code} rattaché à ${c.code}`, a.entityId);
}

export function updateAccount(state: State, accountId: Id, patch: { nameFr?: string; nameEn?: string; kind?: AccountKind; isPostable?: boolean; active?: boolean; requiresCustomer?: boolean; requiresSupplier?: boolean; requiresEngagement?: boolean }): [State, Account] {
  const a = state.accounts.find((x) => x.id === accountId);
  if (!a) throw new DomainError('not_found', 'Compte inconnu');
  if (patch.nameFr !== undefined && !patch.nameFr.trim()) throw new DomainError('name', "L'intitulé est obligatoire");
  if (a.isStatutory && patch.kind && patch.kind !== a.kind) throw new DomainError('statutory', 'Compte statutaire : la nature ne change pas');
  const next: Account = { ...a, ...patch, nameFr: patch.nameFr?.trim() ?? a.nameFr };
  return [audit({ ...state, accounts: state.accounts.map((x) => (x.id === accountId ? next : x)) }, 'account', accountId, 'U', `Compte ${a.code} modifié`, a.entityId), next];
}

// Selecting another template: 'merge' adds the template's accounts the entity does not have yet (always safe);
// 'replace' is for an entity without any entry: its chart, mappings, tax codes and rules are rebuilt.
export function applyChartTemplate(state: State, entityId: Id, template: CoaTemplate, mode: 'merge' | 'replace'): [State, { added: number }] {
  requireRole(state, PARTNER_ROLES, 'de changer le plan comptable');
  const entity = state.entities.find((e) => e.id === entityId);
  if (!entity) throw new DomainError('entity_missing', 'Entité inconnue');
  if (mode === 'replace') {
    if (state.entries.some((e) => e.entityId === entityId)) throw new DomainError('in_use', 'Des écritures existent : seule la complétion du plan est possible (pas de remplacement)');
    const stripped: State = { ...state, accounts: state.accounts.filter((a) => a.entityId !== entityId), mappings: state.mappings.filter((m) => m.entityId !== entityId), taxCodes: state.taxCodes.filter((t) => t.entityId !== entityId), taxRules: state.taxRules.filter((t) => t.entityId !== entityId), journals: state.journals.filter((j) => j.entityId !== entityId), bankRules: state.bankRules.filter((b) => b.entityId !== entityId), entities: state.entities.map((e) => (e.id === entityId ? { ...e, coaTemplate: template } : e)) };
    const s = seedChart(stripped, entityId, template);
    return [audit(s, 'entity', entityId, 'U', `Plan comptable remplacé par ${template}`, entityId), { added: s.accounts.filter((a) => a.entityId === entityId).length }];
  }
  let s = state;
  let added = 0;
  const existing = new Set(state.accounts.filter((a) => a.entityId === entityId).map((a) => a.code));
  for (const t of presentedAccounts(template, codeLength(state, entityId))) {
    if (existing.has(t.code) || existing.has(t.orig)) continue;
    const [s1, id] = nextId(s, 'acc');
    s = { ...s1, accounts: [...s1.accounts, { id, entityId, code: t.code, nameFr: t.nameFr, kind: t.kind, isPostable: !t.isRoot && !t.grouping, isStatutory: t.isRoot, active: true }] };
    added++;
  }
  return [audit(s, 'entity', entityId, 'U', `Plan comptable complété avec ${template} · ${added} compte(s)`, entityId), { added }];
}

// ---- Excel round trip -------------------------------------------------------------------------------------

export const CHART_COLUMNS = ['Numéro', 'Intitulé', 'Intitulé (EN)', 'Classe', 'Type', 'Imputable', 'Dimension', 'Actif'] as const;
export const ACCOUNT_KIND_FR: Record<AccountKind, string> = { asset: 'Actif', liability: 'Passif', equity: 'Capitaux propres', income: 'Produit', expense: 'Charge' };
const KIND_BY_WORD: Record<string, AccountKind> = { actif: 'asset', asset: 'asset', passif: 'liability', liability: 'liability', dette: 'liability', 'capitaux propres': 'equity', capitaux: 'equity', equity: 'equity', produit: 'income', produits: 'income', income: 'income', revenue: 'income', charge: 'expense', charges: 'expense', expense: 'expense' };
const DIMENSION_BY_WORD: Record<string, 'customer' | 'supplier' | 'engagement'> = { client: 'customer', customer: 'customer', fournisseur: 'supplier', supplier: 'supplier', mission: 'engagement', engagement: 'engagement' };

export interface ChartRow {
  code: string;
  nameFr: string;
  nameEn?: string;
  cls?: string;
  kind?: string;
  postable?: string;
  dimension?: string;
  active?: string;
}

export interface ValidatedChartRow {
  line: number;
  code: string;
  nameFr: string;
  nameEn?: string;
  kind: AccountKind;
  isPostable: boolean;
  requiresCustomer: boolean;
  requiresSupplier: boolean;
  requiresEngagement: boolean;
  active: boolean;
  action: 'create' | 'update' | 'unchanged';
  existingId?: Id;
}

export interface ChartImportReport {
  rows: ValidatedChartRow[];
  errors: { line: number; code: string; message: string }[];
  warnings: { line: number; code: string; message: string }[];
  toCreate: number;
  toUpdate: number;
  unchanged: number;
}

export function exportChartRows(state: State, entityId: Id): (string | number)[][] {
  const rows = state.accounts.filter((a) => a.entityId === entityId && !a.isAuxiliary).sort((a, b) => (a.code < b.code ? -1 : 1));
  return [
    [...CHART_COLUMNS],
    ...rows.map((a) => [a.code, a.nameFr, a.nameEn ?? '', a.code.slice(0, 1), ACCOUNT_KIND_FR[a.kind], a.isPostable ? 'oui' : 'non', a.requiresCustomer ? 'client' : a.requiresSupplier ? 'fournisseur' : a.requiresEngagement ? 'mission' : '', a.active ? 'oui' : 'non']),
  ];
}

const yes = (v: string | undefined, def: boolean) => (v === undefined || v.trim() === '' ? def : /^(oui|o|yes|y|true|1|x)$/i.test(v.trim()));

// Checks a sheet before anything is written: duplicates, codes, classes, kinds. Errors block the import, warnings do not.
export function validateChartImport(state: State, entityId: Id, rows: ChartRow[]): ChartImportReport {
  const errors: ChartImportReport['errors'] = [];
  const warnings: ChartImportReport['warnings'] = [];
  const out: ValidatedChartRow[] = [];
  const seen = new Map<string, number>();
  const existing = new Map(state.accounts.filter((a) => a.entityId === entityId && !a.isAuxiliary).map((a) => [a.code, a]));
  const length = codeLength(state, entityId);
  rows.forEach((r, i) => {
    const line = i + 2; // sheet row, after the header
    const raw = String(r.code ?? '').trim();
    const name = String(r.nameFr ?? '').trim();
    if (!raw && !name) return; // blank line
    if (!/^\d{2,8}$/.test(raw)) { errors.push({ line, code: raw, message: 'Numéro de compte invalide (2 à 8 chiffres)' }); return; }
    // a short postable number is presented on the entity's length; roots (2 digits) and groupings keep their form
    const isGrouping = rows.some((o) => { const oc = String(o.code ?? '').trim(); return oc !== raw && oc.startsWith(raw); }) || [...existing.keys()].some((k) => k !== raw && k.startsWith(raw) && k.length < length);
    const code = raw.length === 2 || isGrouping ? raw : normalizeCode(raw, length);
    if (code !== raw && !existing.has(code) && existing.has(raw)) { /* an existing short account keeps its code */ }
    if (!name) { errors.push({ line, code, message: 'Intitulé manquant' }); return; }
    if (seen.has(code)) { errors.push({ line, code, message: `Doublon dans le fichier (ligne ${seen.get(code)})` }); return; }
    seen.set(code, line);
    const cls = String(r.cls ?? '').trim();
    if (cls && cls !== code.slice(0, 1)) { errors.push({ line, code, message: `Classe ${cls} incohérente avec le numéro (classe ${code.slice(0, 1)})` }); return; }
    const kindWord = String(r.kind ?? '').trim().toLowerCase();
    let kind: AccountKind | undefined = kindWord ? KIND_BY_WORD[kindWord] : undefined;
    if (kindWord && !kind) { errors.push({ line, code, message: `Type inconnu « ${r.kind} » (Actif, Passif, Capitaux propres, Produit, Charge)` }); return; }
    const prev = existing.get(code) ?? existing.get(raw);
    if (code !== raw && !prev) warnings.push({ line, code, message: `Numéro ${raw} présenté sur ${length} chiffres : ${code}` });
    if (!kind) {
      const c = code.slice(0, 1);
      kind = prev?.kind ?? (c === '1' ? 'equity' : c === '2' || c === '3' || c === '5' ? 'asset' : c === '6' ? 'expense' : c === '7' ? 'income' : undefined);
      if (!kind) { errors.push({ line, code, message: 'Type requis pour un compte de classe ' + c + ' (Actif ou Passif)' }); return; }
    }
    const dimWord = String(r.dimension ?? '').trim().toLowerCase();
    const dim = dimWord ? DIMENSION_BY_WORD[dimWord] : undefined;
    if (dimWord && !dim) { errors.push({ line, code, message: `Dimension inconnue « ${r.dimension} » (client, fournisseur, mission)` }); return; }
    const isPostable = yes(r.postable, prev ? prev.isPostable : code.length > 2);
    const active = yes(r.active, prev ? prev.active : true);
    if (prev?.isStatutory && prev.kind !== kind) { errors.push({ line, code, message: 'Compte statutaire : la nature ne peut pas changer' }); return; }
    if (prev?.isStatutory && isPostable) warnings.push({ line, code, message: 'Compte de regroupement statutaire : reste non imputable' });
    const row: ValidatedChartRow = { line, code, nameFr: name, nameEn: r.nameEn?.trim() || undefined, kind, isPostable: prev?.isStatutory ? false : isPostable, requiresCustomer: dim === 'customer', requiresSupplier: dim === 'supplier', requiresEngagement: dim === 'engagement', active, action: 'create', existingId: prev?.id };
    if (prev) {
      const same = prev.nameFr === row.nameFr && (prev.nameEn ?? undefined) === row.nameEn && prev.kind === row.kind && prev.isPostable === row.isPostable && !!prev.requiresCustomer === row.requiresCustomer && !!prev.requiresSupplier === row.requiresSupplier && !!prev.requiresEngagement === row.requiresEngagement && prev.active === row.active;
      row.action = same ? 'unchanged' : 'update';
      if (row.action === 'update') warnings.push({ line, code, message: `Compte existant : mis à jour (${prev.nameFr} → ${row.nameFr})` });
      if (!row.active && state.entries.some((e) => e.entityId === entityId && e.status !== 'draft' && e.lines.some((l) => l.accountId === prev.id))) warnings.push({ line, code, message: 'Compte mouvementé désactivé : plus imputable, historique conservé' });
    } else if (code.length === 2) warnings.push({ line, code, message: 'Nouveau compte de regroupement (2 chiffres) : créé non imputable' });
    out.push(row);
  });
  return { rows: out, errors, warnings, toCreate: out.filter((r) => r.action === 'create').length, toUpdate: out.filter((r) => r.action === 'update').length, unchanged: out.filter((r) => r.action === 'unchanged').length };
}

export function applyChartImport(state: State, entityId: Id, report: ChartImportReport): [State, { created: number; updated: number }] {
  requireRole(state, [...PARTNER_ROLES, 'accountant', 'manager'], "d'importer le plan comptable");
  if (report.errors.length) throw new DomainError('import_errors', `${report.errors.length} erreur(s) à corriger avant l'import`);
  let s = state;
  let created = 0, updated = 0;
  for (const r of report.rows) {
    if (r.action === 'unchanged') continue;
    if (r.action === 'update' && r.existingId) {
      s = { ...s, accounts: s.accounts.map((a) => (a.id === r.existingId ? { ...a, nameFr: r.nameFr, nameEn: r.nameEn, kind: a.isStatutory ? a.kind : r.kind, isPostable: a.isStatutory ? false : r.isPostable, requiresCustomer: r.requiresCustomer, requiresSupplier: r.requiresSupplier, requiresEngagement: r.requiresEngagement, active: r.active } : a)) };
      updated++;
    } else {
      const [s1, id] = nextId(s, 'acc');
      s = { ...s1, accounts: [...s1.accounts, { id, entityId, code: r.code, nameFr: r.nameFr, nameEn: r.nameEn, kind: r.kind, isPostable: r.code.length > 2 && r.isPostable, isStatutory: r.code.length === 2, requiresCustomer: r.requiresCustomer, requiresSupplier: r.requiresSupplier, requiresEngagement: r.requiresEngagement, active: r.active }] };
      created++;
    }
  }
  return [audit(s, 'account', entityId, 'U', `Import du plan comptable · ${created} créé(s), ${updated} mis à jour`, entityId), { created, updated }];
}
