// "@bumex/domain" for BUMEX Vanguard (tsconfig paths): the engine as delivered, with each change it makes wrapped so
// the store can record it (record.ts). Same list as commands.ts (record.test.ts checks).
import { vanguardCommands as c } from "@/lib/erp/vanguard/commands";
import { recorded } from "@/lib/erp/vanguard/record";
import { canOpenRoom as engineCanOpenRoom, canSee } from "@/lib/erp/engine";
import type { ChainCheck, Id, State } from "@/lib/erp/engine";

export * from "@/lib/erp/engine";

export const addAccount = recorded("addAccount", c.addAccount);
export const addAsset = recorded("addAsset", c.addAsset);
export const addAssetCategory = recorded("addAssetCategory", c.addAssetCategory);
export const addBankAccount = recorded("addBankAccount", c.addBankAccount);
export const addCustomer = recorded("addCustomer", c.addCustomer);
export const addEmployee = recorded("addEmployee", c.addEmployee);
export const addJournal = recorded("addJournal", c.addJournal);
export const addLoan = recorded("addLoan", c.addLoan);
export const addSupplier = recorded("addSupplier", c.addSupplier);
export const addTaxCode = recorded("addTaxCode", c.addTaxCode);
export const applyChartImport = recorded("applyChartImport", c.applyChartImport);
export const applyChartTemplate = recorded("applyChartTemplate", c.applyChartTemplate);
export const approveSupplierInvoice = recorded("approveSupplierInvoice", c.approveSupplierInvoice);
export const archiveEngagement = recorded("archiveEngagement", c.archiveEngagement);
export const assign = recorded("assign", c.assign);
export const bookByRule = recorded("bookByRule", c.bookByRule);
export const bookToSuspense = recorded("bookToSuspense", c.bookToSuspense);
export const bookTransfer = recorded("bookTransfer", c.bookTransfer);
export const completeTask = recorded("completeTask", c.completeTask);
export const createCreditNote = recorded("createCreditNote", c.createCreditNote);
export const createDraft = recorded("createDraft", c.createDraft);
export const createFiscalYear = recorded("createFiscalYear", c.createFiscalYear);
export const createInvoice = recorded("createInvoice", c.createInvoice);
export const createSupplierInvoice = recorded("createSupplierInvoice", c.createSupplierInvoice);
export const createTask = recorded("createTask", c.createTask);
export const createUser = recorded("createUser", c.createUser);
export const decideDeletion = recorded("decideDeletion", c.decideDeletion);
export const deleteDraft = recorded("deleteDraft", c.deleteDraft);
export const deleteJournal = recorded("deleteJournal", c.deleteJournal);
export const destroyArchive = recorded("destroyArchive", c.destroyArchive);
export const importStatement = recorded("importStatement", c.importStatement);
export const matchToPayment = recorded("matchToPayment", c.matchToPayment);
export const payInstalment = recorded("payInstalment", c.payInstalment);
export const paySupplierInvoice = recorded("paySupplierInvoice", c.paySupplierInvoice);
export const postDepreciation = recorded("postDepreciation", c.postDepreciation);
export const postEntry = recorded("postEntry", c.postEntry);
export const postPayroll = recorded("postPayroll", c.postPayroll);
export const recordPayment = recorded("recordPayment", c.recordPayment);
export const rejectSupplierInvoice = recorded("rejectSupplierInvoice", c.rejectSupplierInvoice);
export const removeAssignment = recorded("removeAssignment", c.removeAssignment);
export const reopenTask = recorded("reopenTask", c.reopenTask);
export const requestDeletion = recorded("requestDeletion", c.requestDeletion);
export const retrieveArchive = recorded("retrieveArchive", c.retrieveArchive);
export const returnArchive = recorded("returnArchive", c.returnArchive);
export const reverseEntry = recorded("reverseEntry", c.reverseEntry);
export const sendDunning = recorded("sendDunning", c.sendDunning);
export const setBankAccountActive = recorded("setBankAccountActive", c.setBankAccountActive);
export const setFiscalYearClosed = recorded("setFiscalYearClosed", c.setFiscalYearClosed);
export const setLoanSchedule = recorded("setLoanSchedule", c.setLoanSchedule);
export const setPayrollRules = recorded("setPayrollRules", c.setPayrollRules);
export const setPeriodStatus = recorded("setPeriodStatus", c.setPeriodStatus);
export const setTaxRule = recorded("setTaxRule", c.setTaxRule);
export const setThirdPartyRules = recorded("setThirdPartyRules", c.setThirdPartyRules);
export const setUserStatus = recorded("setUserStatus", c.setUserStatus);
export const startTask = recorded("startTask", c.startTask);
export const updateAccount = recorded("updateAccount", c.updateAccount);
export const updateAsset = recorded("updateAsset", c.updateAsset);
export const updateAssetCategory = recorded("updateAssetCategory", c.updateAssetCategory);
export const updateAssignment = recorded("updateAssignment", c.updateAssignment);
export const updateBankAccount = recorded("updateBankAccount", c.updateBankAccount);
export const updateCustomer = recorded("updateCustomer", c.updateCustomer);
export const updateDraft = recorded("updateDraft", c.updateDraft);
export const updateEmployee = recorded("updateEmployee", c.updateEmployee);
export const updateJournal = recorded("updateJournal", c.updateJournal);
export const updateLoan = recorded("updateLoan", c.updateLoan);
export const updateSupplier = recorded("updateSupplier", c.updateSupplier);
export const updateTaxCode = recorded("updateTaxCode", c.updateTaxCode);
export const updateUserAccess = recorded("updateUserAccess", c.updateUserAccess);
export const validateInvoice = recorded("validateInvoice", c.validateInvoice);

// The hash chains are sealed and checked by the database (erp.verify_chain): the engine's own check recomputes the
// hashes in its format, which is not the database's. The server sends the entries whose check failed; an entry
// posted since the last load counts as correct until the next one.
let chainBreaks = new Set<string>();
export function setChainBreaks(entryIds: string[]) {
  chainBreaks = new Set(entryIds);
}
export function verifyChain(state: State, entityId: Id, journalId: Id): ChainCheck[] {
  return state.entries
    .filter((e) => e.entityId === entityId && e.journalId === journalId && e.status !== "draft")
    .sort((a, b) => (a.chainSeq ?? 0) - (b.chainSeq ?? 0))
    .map((e) => ({ entryId: e.id, chainSeq: e.chainSeq ?? 0, entryNo: e.entryNo ?? 0, ok: !chainBreaks.has(e.id) }));
}

// The HR room opens to everyone who sees the floor, on its "Personnes" tab (BUMEX One's Team page moved there,
// vanguard/one/People.tsx); its other tabs keep needing the HR module (vanguard/ui/panels/Hr.tsx), and the server
// checks the module of every change (replay.ts, canUseModule).
export function canOpenRoom(state: State, entityId: Id, room: string): boolean {
  return room === "hr" ? canSee(state, entityId) : engineCanOpenRoom(state, entityId, room);
}
