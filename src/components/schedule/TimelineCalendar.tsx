import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ProductionCalendarEvent, ProductionDay } from '../../domain/scheduling';
import {
  dayNumberToIso,
  eventSpan,
  isoDayNumber,
  productionDaySpan,
  shiftClipSpan,
  timelineBoundsFor,
  todayIso,
} from '../../domain/scheduling';

/** Per-line clip palette; index 0 is the default for new lines. */
export const EVENT_COLOR_SWATCHES = [
  '#7c3aed',
  '#0ea5e9',
  '#059669',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
];
const DEFAULT_EVENT_COLOR = EVENT_COLOR_SWATCHES[0];
const MS_PER_DAY = 86_400_000;

type ClipMode = 'move' | 'resize-start' | 'resize-end';

interface ActiveDrag {
  kind: 'event' | 'day';
  id: string;
  mode: ClipMode;
  /** Viewport x where the gesture started. */
  startClientX: number;
  /**
   * Pixels per day frozen at gesture start. Bounds grow while a clip is
   * dragged past the edge; re-deriving the scale mid-gesture would feed the
   * growth back into the delta (runaway resize).
   */
  pxPerDay: number;
}

interface TimelineCalendarProps {
  events: ProductionCalendarEvent[];
  days: ProductionDay[];
  isLight: boolean;
  onUpdateEvent: (id: string, updates: Partial<ProductionCalendarEvent>) => void;
  onDeleteEvent: (id: string) => void;
  onUpdateDay: (id: string, updates: Partial<ProductionDay>) => void;
}

/**
 * Interactive production timeline calendar: every line (calendar event or
 * shooting day) renders as a draggable, drag-resizable clip. Whole-day math
 * lives in the domain layer (`domain/scheduling/calendarDate`); this component
 * only converts pixel gestures into whole-day deltas.
 */
export const TimelineCalendar: React.FC<TimelineCalendarProps> = ({
  events,
  days,
  isLight,
  onUpdateEvent,
  onDeleteEvent,
  onUpdateDay,
}) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  // Live preview dates for the clip being dragged; committed on release.
  // Mirrored into refs so the window-level gesture listeners always observe
  // the latest preview without re-binding mid-gesture.
  const [eventPreview, setEventPreviewState] = useState<{ id: string; startDate: string; endDate: string } | null>(null);
  const [dayPreview, setDayPreviewState] = useState<{ id: string; date: string } | null>(null);
  const eventPreviewRef = useRef(eventPreview);
  const dayPreviewRef = useRef(dayPreview);
  const setEventPreview = (next: typeof eventPreview) => {
    eventPreviewRef.current = next;
    setEventPreviewState(next);
  };
  const setDayPreview = (next: typeof dayPreview) => {
    dayPreviewRef.current = next;
    setDayPreviewState(next);
  };

  const effectiveEvents = useMemo(
    () =>
      events.map((event) =>
        eventPreview && eventPreview.id === event.id ? { ...event, startDate: eventPreview.startDate, endDate: eventPreview.endDate } : event
      ),
    [events, eventPreview]
  );
  const effectiveDays = useMemo(
    () => days.map((day) => (dayPreview && dayPreview.id === day.id ? { ...day, date: dayPreview.date } : day)),
    [days, dayPreview]
  );

  const bounds = useMemo(
    () =>
      timelineBoundsFor(
        [
          ...effectiveEvents.map(eventSpan),
          ...effectiveDays.map(productionDaySpan),
        ].filter((span): span is NonNullable<typeof span> => span !== null),
        { padding: 2, minDays: 14 }
      ),
    [effectiveEvents, effectiveDays]
  );

  // Drive window-level listeners from the active gesture so drags keep
  // working when the pointer leaves the clip or even the canvas.
  useEffect(() => {
    if (!drag) return;

    /** Convert horizontal pixels into whole-day deltas against the scale frozen at gesture start. */
    const deltaDaysFromPixels = (clientX: number): number =>
      Math.round((clientX - drag.startClientX) / Math.max(drag.pxPerDay, 1));

    const handleMove = (e: PointerEvent) => {
      const deltaDays = deltaDaysFromPixels(e.clientX);
      if (deltaDays === 0 && !eventPreviewRef.current && !dayPreviewRef.current) return;
      if (drag.kind === 'event') {
        const original = events.find((candidate) => candidate.id === drag.id);
        if (!original) return;
        // Resize/move deltas accumulate from the ORIGINAL span, not the live
        // preview, so jitter never compounds mid-gesture.
        const next = shiftClipSpan(original, deltaDays, drag.mode);
        setEventPreview({ id: drag.id, ...next });
      } else {
        const original = days.find((candidate) => candidate.id === drag.id);
        const base = isoDayNumber(original?.date);
        if (base === null) return;
        setDayPreview({ id: drag.id, date: dayNumberToIso(base + deltaDays) });
      }
    };

    const commit = () => {
      if (drag.kind === 'event') {
        const original = events.find((candidate) => candidate.id === drag.id);
        const preview = eventPreviewRef.current;
        if (original && preview) {
          onUpdateEvent(drag.id, { startDate: preview.startDate, endDate: preview.endDate });
        }
      } else {
        const preview = dayPreviewRef.current;
        if (preview) onUpdateDay(preview.id, { date: preview.date });
      }
      setDrag(null);
      setEventPreview(null);
      setDayPreview(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', commit, { once: true });
    window.addEventListener('pointercancel', commit, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', commit);
      window.removeEventListener('pointercancel', commit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  const startDrag = (kind: ActiveDrag['kind'], id: string, mode: ClipMode) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Measure the header lane: it is always mounted, unlike row lanes that
    // come and go as events are added/deleted.
    const width = laneRef.current?.getBoundingClientRect().width ?? 0;
    const pxPerDay = bounds.days > 0 && width > 0 ? width / bounds.days : 0;
    if (pxPerDay <= 0) return;
    setDrag({ kind, id, mode, startClientX: e.clientX, pxPerDay });
  };

  const pctPerDay = 100 / bounds.days;
  const clipStyle = (span: { start: number; end: number }): React.CSSProperties => ({
    left: `${Math.max(0, (span.start - bounds.start) * pctPerDay)}%`,
    width: `${Math.max(0.4, (span.end - span.start + 1) * pctPerDay)}%`,
    touchAction: 'none',
  });

  // Local calendar date, like every other date in the scheduler (UTC would
  // put the marker on yesterday's column east of Greenwich after midnight).
  const todayIsoNumber = isoDayNumber(todayIso());
  const showTodayMarker =
    todayIsoNumber !== null && todayIsoNumber >= bounds.start && todayIsoNumber <= bounds.end;

  const cardClass = isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700';
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const laneBg = isLight ? 'bg-slate-50' : 'bg-slate-950';

  const renderLaneHeader = () => (
    <div className="grid grid-cols-[170px_1fr] bg-slate-900 text-white h-9 items-center">
      <div className="px-3 text-[9px] font-black uppercase tracking-wider">Production timeline</div>
      <div ref={laneRef} className="relative h-full overflow-hidden">
        {Array.from({ length: bounds.days }, (_, index) => {
          const date = new Date((bounds.start + index) * MS_PER_DAY);
          return (
            <span
              key={index}
              className="absolute inset-y-0 border-l border-slate-700 px-1 pt-2 text-[8px] font-mono text-slate-400"
              style={{ left: `${index * pctPerDay}%` }}
            >
              {index === 0 || date.getUTCDate() === 1
                ? `${date.toLocaleString(undefined, { month: 'short', timeZone: 'UTC' })} ${date.getUTCDate()}`
                : date.getUTCDate()}
            </span>
          );
        })}
      </div>
    </div>
  );

  const renderRowFrame = (key: React.Key, label: React.ReactNode, lane: React.ReactNode) => (
    <div key={key} className={`grid grid-cols-[170px_1fr] min-h-11 items-center border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
      <div className="px-3 flex items-center gap-2 min-w-0">{label}</div>
      <div className={`relative h-7 overflow-hidden ${laneBg}`}>
        {showTodayMarker && (
          <div
            className="absolute inset-y-0 w-px bg-cyan-400/70"
            style={{ left: `${((todayIsoNumber as number) - bounds.start) * pctPerDay}%` }}
            title="Today"
          />
        )}
        {lane}
      </div>
    </div>
  );

  return (
    <div className={`rounded-lg border overflow-x-auto custom-scrollbar ${cardClass}`}>
      <div style={{ minWidth: Math.max(680, bounds.days * 30 + 180) }}>
        {renderLaneHeader()}

        {!effectiveEvents.length && !effectiveDays.length && (
          <div className={`py-12 text-center text-[10px] ${mutedText}`}>
            Add a milestone above or your first shooting day — both appear here as draggable clips.
          </div>
        )}

        {/* Calendar-event lines */}
        {effectiveEvents.map((event) => {
          const span = eventSpan(event);
          const color = event.color ?? DEFAULT_EVENT_COLOR;
          const dragging = drag?.kind === 'event' && drag.id === event.id;
          return renderRowFrame(
            event.id,
            <>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black truncate">{event.title}</div>
                <div className={`text-[8px] uppercase ${mutedText}`}>
                  {event.startDate}{event.endDate !== event.startDate ? ` → ${event.endDate}` : ''}
                </div>
              </div>
              <input
                type="color"
                aria-label={`Color for ${event.title}`}
                title="Line color"
                value={color}
                onChange={(e) => onUpdateEvent(event.id, { color: e.target.value })}
                className="w-4 h-4 p-0 border-0 rounded-full cursor-pointer bg-transparent shrink-0"
              />
              <button onClick={() => onDeleteEvent(event.id)} className={`${mutedText} hover:text-red-500 shrink-0`} title="Delete line">
                <Trash2 className="w-3 h-3" />
              </button>
            </>,
            span && (
              <div
                role="button"
                tabIndex={0}
                aria-label={`${event.title}: drag to move, drag edges to resize`}
                onPointerDown={startDrag('event', event.id, 'move')}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') onUpdateEvent(event.id, shiftClipSpan(event, e.shiftKey ? -7 : -1, 'move'));
                  if (e.key === 'ArrowRight') onUpdateEvent(event.id, shiftClipSpan(event, e.shiftKey ? 7 : 1, 'move'));
                }}
                className={`absolute top-1 bottom-1 rounded text-white text-[8px] font-black flex items-center justify-between select-none ${
                  dragging ? 'ring-2 ring-cyan-300 opacity-90' : ''
                }`}
                style={{ ...clipStyle(span), backgroundColor: color }}
              >
                <span
                  onPointerDown={startDrag('event', event.id, 'resize-start')}
                  className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/50 rounded-l"
                  title="Drag start"
                />
                <span className="px-2 truncate pointer-events-none">{event.title}</span>
                <span
                  onPointerDown={startDrag('event', event.id, 'resize-end')}
                  className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-white/50 rounded-r"
                  title="Drag end"
                />
              </div>
            )
          );
        })}
        {!effectiveEvents.length && effectiveDays.length > 0 && (
          <div className={`px-3 py-2 text-[8px] uppercase tracking-wider border-b ${mutedText} ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
            No milestone lines yet — phases you add appear above the shoot days.
          </div>
        )}

        {/* Shooting-day clips (one day wide; drag horizontally to re-date) */}
        {effectiveDays.map((day, index) => {
          const span = productionDaySpan(day);
          const dragging = drag?.kind === 'day' && drag.id === day.id;
          return renderRowFrame(
            day.id,
            <>
              <div className="w-6 h-6 rounded bg-cyan-500 text-slate-950 flex flex-col items-center justify-center leading-none shrink-0">
                <span className="text-[6px] font-black uppercase">Day</span>
                <span className="text-[10px] font-black">{index + 1}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black truncate">{day.name}</div>
                <div className={`text-[8px] uppercase ${mutedText}`}>{day.date ?? 'undated'}</div>
              </div>
            </>,
            span && (
              <div
                role="button"
                tabIndex={0}
                aria-label={`${day.name}: drag to change its date`}
                onPointerDown={startDrag('day', day.id, 'move')}
                onKeyDown={(e) => {
                  if (!day.date) return;
                  if (e.key === 'ArrowLeft') onUpdateDay(day.id, { date: dayNumberToIso((isoDayNumber(day.date) as number) - (e.shiftKey ? 7 : 1)) });
                  if (e.key === 'ArrowRight') onUpdateDay(day.id, { date: dayNumberToIso((isoDayNumber(day.date) as number) + (e.shiftKey ? 7 : 1)) });
                }}
                className={`absolute top-1 bottom-1 rounded bg-cyan-600 text-white text-[8px] font-black flex items-center justify-center select-none cursor-grab active:cursor-grabbing ${
                  dragging ? 'ring-2 ring-cyan-300 opacity-90' : ''
                }`}
                style={clipStyle(span)}
              >
                <span className="truncate px-2 pointer-events-none">{day.name}</span>
              </div>
            )
          );
        })}
      </div>
    </div>
  );
};
