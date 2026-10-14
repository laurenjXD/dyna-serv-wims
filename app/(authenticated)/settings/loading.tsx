export default function SettingsLoading() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-64 bg-slate-200 rounded-lg" />
        <div className="h-4 w-96 bg-slate-100 rounded-lg" />
      </div>

      {/* Content Section Skeleton */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="h-10 w-10 bg-slate-200 rounded-xl" />
          <div className="space-y-1.5 flex-1">
            <div className="h-4 w-48 bg-slate-200 rounded" />
            <div className="h-3 w-80 bg-slate-100 rounded" />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="h-10 bg-slate-100 rounded-xl" />
          <div className="h-10 bg-slate-100 rounded-xl" />
          <div className="h-10 bg-slate-100 rounded-xl sm:col-span-2" />
          <div className="h-10 bg-slate-100 rounded-xl" />
          <div className="h-10 bg-slate-100 rounded-xl" />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
        <div className="h-5 w-40 bg-slate-200 rounded" />
        <div className="h-32 bg-slate-100 rounded-xl" />
      </div>
    </div>
  );
}
