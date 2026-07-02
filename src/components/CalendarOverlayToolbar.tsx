import { RefreshCw } from "lucide-react";

interface CalendarOverlayToolbarProps {
  showPrimary: boolean;
  setShowPrimary: (value: boolean) => void;
  showChalkFarm: boolean;
  setShowChalkFarm: (value: boolean) => void;
  showWtr5: boolean;
  setShowWtr5: (value: boolean) => void;
  showWtr1To4: boolean;
  setShowWtr1To4: (value: boolean) => void;
  chalkFarmCalendarId: string | null;
  isLoadingCal: boolean;
  onRefresh: () => void;
  compact?: boolean;
}

export default function CalendarOverlayToolbar({
  showPrimary,
  setShowPrimary,
  showChalkFarm,
  setShowChalkFarm,
  showWtr5,
  setShowWtr5,
  showWtr1To4,
  setShowWtr1To4,
  chalkFarmCalendarId,
  isLoadingCal,
  onRefresh,
  compact = false,
}: CalendarOverlayToolbarProps) {
  const pill = compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]";
  const dot = compact ? "w-1 h-1" : "w-1.5 h-1.5";

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${
        compact ? "text-[9px] font-bold" : "text-[10px] font-bold"
      }`}
    >
      <span className={`text-natural-muted uppercase ${compact ? "mr-1" : "mr-1 tracking-wider"}`}>
        Overlays:
      </span>

      <button
        onClick={() => setShowPrimary(!showPrimary)}
        className={`${pill} rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
          showPrimary
            ? "bg-natural-sage/10 border-natural-sage text-natural-sage font-semibold"
            : "bg-white border-[#e0e0d6] text-natural-muted/60 hover:text-natural-muted"
        }`}
      >
        <div className={`${dot} rounded-full ${showPrimary ? "bg-natural-sage" : "bg-natural-muted/40"}`} />
        {compact ? "My Registry" : "My Schedule"}
      </button>

      <button
        onClick={() => setShowChalkFarm(!showChalkFarm)}
        className={`${pill} rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
          showChalkFarm
            ? "bg-cyan-50 border-cyan-400 text-cyan-800 font-semibold"
            : "bg-white border-[#e0e0d6] text-natural-muted/60 hover:text-natural-muted"
        }`}
        title={
          chalkFarmCalendarId
            ? "Connected to live Google Calendar"
            : 'No Google Calendar found for "Chalk Farm Studio". Showing demo events.'
        }
      >
        <div className={`${dot} rounded-full ${showChalkFarm ? "bg-cyan-500" : "bg-natural-muted/40"}`} />
        Chalk Farm Studio {chalkFarmCalendarId ? "(Live)" : "(Demo)"}
      </button>

      <button
        onClick={() => setShowWtr5(!showWtr5)}
        className={`${pill} rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
          showWtr5
            ? "bg-indigo-50 border-indigo-400 text-indigo-800 font-semibold"
            : "bg-white border-[#e0e0d6] text-natural-muted/60 hover:text-natural-muted"
        }`}
      >
        <div className={`${dot} rounded-full ${showWtr5 ? "bg-indigo-500" : "bg-natural-muted/40"}`} />
        {compact ? "WTR 5" : "Waterloo (WTR 5)"}
      </button>

      <button
        onClick={() => setShowWtr1To4(!showWtr1To4)}
        className={`${pill} rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
          showWtr1To4
            ? "bg-amber-50 border-amber-400 text-amber-800 font-semibold"
            : "bg-white border-[#e0e0d6] text-natural-muted/60 hover:text-natural-muted"
        }`}
      >
        <div className={`${dot} rounded-full ${showWtr1To4 ? "bg-amber-500" : "bg-natural-muted/40"}`} />
        {compact ? "WTR 1-4" : "Waterloo (WTR 1-4)"}
      </button>

      <button
        onClick={onRefresh}
        disabled={isLoadingCal}
        className={`p-1 rounded bg-white border border-[#e0e0d6] text-natural-sage disabled:opacity-50 cursor-pointer shadow-2xs ${
          compact ? "ml-auto shrink-0" : "ml-1"
        }`}
        title="Refresh Google Calendar"
      >
        <RefreshCw className={`${compact ? "w-2.5 h-2.5" : "w-3 h-3"} ${isLoadingCal ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}