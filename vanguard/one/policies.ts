import type { Policy } from './cache';

// What each screen reads from the server: how long it is shown without asking again, and what makes it stale (asked
// on 2026-11-22, page by page; one/cache.ts). Two kinds of words in `on`:
// - what the store's sync reports moved (store.ts): the audited tables (task, time_entry, engagement, customer…),
//   "person" (the people, the missions' members) and "erp" (a state read whole: the books changed);
// - what the person's own change names (invalidate()): data the audit log does not see.
//     subtasks, comments   a ticket's sub-tasks and comments (My work and My day list them too)
//     notifications        the bell's (its own 30-second check moves it: ui/Header.tsx)
//     roadmap              milestones          board       a floor's statuses and rules
//     clients, contracts, documents            timesheet   a week sent, approved, returned
//     account, permissions, mail               ticket:<id>, project:<id>, person:<id>, client:<id>, contract:<id>
// `fresh` is for what neither sees (others' comments, a background job): read again behind what is shown after it.
// `poll` only where others' work arrives while one watches (a ticket's page, a manager's review, the mail intake).

const S = 1000;
const MIN = 60 * S;

export const POLICY = {
  // the floor at a glance: its tickets, hours, team and money
  overview: { fresh: 5 * MIN, on: ['task', 'time_entry', 'engagement', 'person', 'erp'] },
  // the person's own work: tickets, sub-tasks, mentions, hours
  myWork: { fresh: 1 * MIN, on: ['task', 'time_entry', 'person', 'subtasks', 'comments', 'notifications'] },
  myDay: { fresh: 1 * MIN, on: ['task', 'time_entry', 'person', 'subtasks', 'notifications', 'timesheet'] },
  // a ticket's page: others comment on it while it is open
  ticket: { fresh: 30 * S, on: ['task', 'time_entry', 'board', 'subtasks', 'comments', 'documents'], poll: 1 * MIN },
  // a mission's page and its roadmap lane
  project: { fresh: 2 * MIN, on: ['task', 'time_entry', 'engagement', 'person', 'documents', 'roadmap', 'clients'] },
  roadmap: { fresh: 2 * MIN, on: ['engagement', 'task', 'roadmap'] },
  calendar: { fresh: 2 * MIN, on: ['task', 'engagement', 'roadmap', 'contracts', 'clients'] },
  // the team, a person
  people: { fresh: 5 * MIN, on: ['person', 'task', 'time_entry'] },
  person: { fresh: 2 * MIN, on: ['person', 'task', 'time_entry', 'engagement'] },
  peopleLoads: { fresh: 2 * MIN, on: ['task', 'time_entry', 'person'] },
  // time: the person's week, a manager's review (others send their weeks while it is open), the year
  myTime: { fresh: 5 * MIN, on: ['time_entry', 'timesheet', 'task'] },
  teamTime: { fresh: 1 * MIN, on: ['time_entry', 'timesheet', 'person'], poll: 2 * MIN },
  teamYear: { fresh: 5 * MIN, on: ['time_entry', 'timesheet', 'person'] },
  // reports: the same filters give the same result until the work moves
  report: { fresh: 5 * MIN, on: ['task', 'time_entry', 'person', 'engagement'] },
  reportOptions: { fresh: 30 * MIN, on: ['person', 'engagement', 'customer', 'clients'] },
  // clients, contracts, documents
  clients: { fresh: 5 * MIN, on: ['customer', 'clients', 'engagement', 'erp'] },
  client: { fresh: 2 * MIN, on: ['customer', 'clients', 'contracts', 'task', 'engagement', 'documents', 'erp'] },
  contracts: { fresh: 2 * MIN, on: ['contracts', 'clients', 'customer'] },
  documents: { fresh: 2 * MIN, on: ['documents'] },
  // the bell's list
  inbox: { fresh: 30 * S, on: ['notifications'] },
  // settings: what only a save changes
  account: { fresh: 30 * MIN, on: ['account', 'person'] },
  permissions: { fresh: 5 * MIN, on: ['permissions', 'person', 'user_access', 'access_grant', 'app_user', 'erp'] },
  mail: { fresh: 1 * MIN, on: ['mail', 'task'], poll: 1 * MIN },
  board: { fresh: 30 * MIN, on: ['board'] },
  history: { fresh: 1 * MIN, on: ['task', 'time_entry', 'engagement', 'person', 'erp', 'clients', 'contracts', 'documents', 'roadmap', 'comments'] },
  financeArchive: { fresh: 5 * MIN, on: ['erp'] },
  // the lists a form offers (missions, people, clients)
  missionOptions: { fresh: 10 * MIN, on: ['person', 'engagement', 'customer', 'clients'] },
  missionDetails: { fresh: 2 * MIN, on: ['engagement', 'person'] },
} satisfies Record<string, Policy>;

/** A policy that a change of this record also makes stale (ticket:<id>, project:<id>…). */
export const withTag = (policy: Policy, tag: string): Policy => ({ ...policy, on: [...(policy.on ?? []), tag] });
