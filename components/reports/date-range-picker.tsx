export function DateRangePicker({
  startDate,
  endDate,
  isFr = false,
}: {
  startDate: string;
  endDate: string;
  isFr?: boolean;
}) {
  return (
    <>
      <div className="space-y-2">
        <label htmlFor="report-start" className="text-sm font-medium">{isFr ? "Date de début" : "Start date"}</label>
        <input
          id="report-start"
          name="start"
          type="date"
          defaultValue={startDate}
          className="h-11 w-full rounded-xl border border-input bg-background/70 px-4 text-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/55"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="report-end" className="text-sm font-medium">{isFr ? "Date de fin" : "End date"}</label>
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
