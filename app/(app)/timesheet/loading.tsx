export default function TimesheetLoading() {
  return <div role="status" aria-label="Loading timesheet" className="space-y-5 animate-pulse">
    <div className="h-9 w-52 rounded-lg bg-muted" />
    <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map(id => <div key={id} className="h-28 rounded-xl bg-muted" />)}</div>
    <div className="h-80 rounded-xl bg-muted" />
  </div>;
}
