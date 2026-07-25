export function DateRangePicker({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  return (
    <>
      <div className="space-y-2">
        <label htmlFor="report-start" className="text-sm font-medium">Start date</label>
        <input
          id="report-start"
          name="start"
          type="date"
          defaultValue={startDate}
          className="h-11 w-full rounded-xl border border-input bg-background/70 px-4 text-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/55"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="report-end" className="text-sm font-medium">End date</label>
        <input
          id="report-end"
          name="end"
          type="date"
          defaultValue={endDate}
          className="h-11 w-full rounded-xl border border-input bg-background/70 px-4 text-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/55"
        />
      </div>
    </>
  );
}
