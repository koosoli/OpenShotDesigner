import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { ProductionCalendarEvent, ProductionDay } from '../../domain/scheduling';
import {
  buildMonthGrid,
  eventsOnDay,
  monthLabel,
  productionDaysOn,
  shiftYearMonth,
  todayIso,
  yearMonthOf,
} from '../../domain/scheduling';
import type { Task } from '../../domain/tasks';
import { tasksDueOn } from '../../domain/tasks';
import type { Person } from '../../domain/people';
import { EVENT_COLOR_SWATCHES } from './TimelineCalendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const EVENT_CATEGORY_LABELS: Record<ProductionCalendarEvent['category'], string> = {
  development: 'Development',
  preproduction: 'Pre-production',
  shoot: 'Shoot',
  post: 'Post',
  delivery: 'Delivery',
  custom: 'Other',
};

export const EVENT_STATUS_LABELS: Record<NonNullable<ProductionCalendarEvent['status']>, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

interface MonthCalendarProps {
  yearMonth: string;
  onChangeMonth: (yearMonth: string) => void;
  events: ProductionCalendarEvent[];
  days: ProductionDay[];
  workDays: Array<{ id: string; date?: string; items: Array<{ label: string }> }>;
  tasks: Task[];
  selectedEventId: string | null;
  onSelectEvent: (id: string | null) => void;
  /** Open the dated daily schedule; event creation stays in the event form. */
  onSelectDate: (iso: string) => void;
  selectedDate: string | null;
  isLight: boolean;
}

/**
 * Month grid for the production calendar: shooting days, calendar events
 * (spanning bars) and task due dates on one page. Date math lives in
 * `domain/scheduling/monthGrid`.
 */
export const MonthCalendar: React.FC<MonthCalendarProps> = ({
  yearMonth,
  onChangeMonth,
  events,
  days,
  workDays,
  tasks,
  selectedEventId,
  onSelectEvent,
  onSelectDate,
  selectedDate,
  isLight,
}) => {
  const grid = useMemo(() => buildMonthGrid(yearMonth), [yearMonth]);
  const today = todayIso();
  const mutedCls = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className={`rounded-lg border overflow-hidden ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900'}`}>
      <div className="flex items-center justify-between px-2 py-1.5 bg-slate-900 text-white">
        <button onClick={() => onChangeMonth(shiftYearMonth(yearMonth, -1))} className="p-1 rounded hover:bg-white/10" title="Previous month" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider">{monthLabel(yearMonth)}</span>
          <button onClick={() => onChangeMonth(yearMonthOf(today))} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20">Today</button>
        </div>
        <button onClick={() => onChangeMonth(shiftYearMonth(yearMonth, 1))} className="p-1 rounded hover:bg-white/10" title="Next month" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className={`grid grid-cols-7 text-[9px] font-black uppercase tracking-wider ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-950 text-slate-400'}`}>
        {WEEKDAYS.map((day) => <div key={day} className="px-1.5 py-1 text-center">{day}</div>)}
      </div>
      {grid.weeks.map((week, weekIndex) => (
        <div key={weekIndex} className={`grid grid-cols-7 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          {week.map((day) => {
            const dayEvents = eventsOnDay(events, day.iso);
            const shootDays = productionDaysOn(days, day.iso);
            const scheduledWork = workDays.filter((workDay) => workDay.date === day.iso);
            const due = tasksDueOn(tasks, day.iso);
            const isToday = day.iso === today;
            return (
              <div
                key={day.iso}
                onClick={() => onSelectDate(day.iso)}
                title="Open this day's shooting schedule"
                className={`min-h-[78px] p-1 border-r last:border-r-0 cursor-pointer transition-colors ${
                  isLight ? 'border-slate-200 hover:bg-sky-50/60' : 'border-slate-800 hover:bg-sky-950/30'
                } ${day.inMonth ? '' : 'opacity-45'} ${selectedDate === day.iso ? 'ring-2 ring-inset ring-sky-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold w-5 h-5 grid place-items-center rounded-full ${isToday ? 'bg-cyan-500 text-white' : mutedCls}`}>{day.dayOfMonth}</span>
                  {shootDays.length > 0 && (
                    <span className="text-[8px] font-black uppercase px-1 rounded bg-amber-500 text-black" title={shootDays.map((d) => d.name).join(', ')}>
                      {shootDays.length === 1 ? shootDays[0].name : `${shootDays.length} days`}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 space-y-0.5">
                  {scheduledWork.flatMap((workDay) => workDay.items).slice(0, 2).map((item, index) => (
                    <p
                      key={`work-${index}-${item.label}`}
                      className={`text-[8px] truncate px-1 rounded border font-semibold ${isLight ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-amber-800 bg-amber-950/50 text-amber-200'}`}
                      title={item.label}
                    >
                      {item.label}
                    </p>
                  ))}
                  {scheduledWork.reduce((sum, workDay) => sum + workDay.items.length, 0) > 2 && (
                    <p className={`text-[8px] ${mutedCls}`}>
                      +{scheduledWork.reduce((sum, workDay) => sum + workDay.items.length, 0) - 2} scheduled
                    </p>
                  )}
                  {dayEvents.slice(0, 3).map((event) => {
                    const color = event.color ?? EVENT_COLOR_SWATCHES[0];
                    const starts = event.startDate === day.iso;
                    const ends = event.endDate === day.iso;
                    const selected = selectedEventId === event.id;
                    return (
                      <button
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(selected ? null : event.id);
                        }}
                        className={`w-full text-left text-[9px] font-bold text-white px-1 leading-4 truncate ${starts ? 'rounded-l' : ''} ${ends ? 'rounded-r' : ''} ${
                          selected ? 'ring-2 ring-white/80' : ''
                        } ${event.status === 'done' ? 'opacity-60 line-through' : ''}`}
                        style={{ backgroundColor: color }}
                        title={`${event.title} · ${event.startDate} → ${event.endDate}`}
                      >
                        {starts || day.weekday === 0 ? event.title : ' '}
                      </button>
                    );
                  })}
                  {dayEvents.length > 3 && <p className={`text-[8px] ${mutedCls}`}>+{dayEvents.length - 3} more</p>}
                  {due.slice(0, 2).map((task) => (
                    <p key={task.id} className={`text-[8px] truncate px-1 rounded border ${task.completedAt ? 'opacity-50 line-through' : ''} ${isLight ? 'border-violet-300 text-violet-700 bg-violet-50' : 'border-violet-700 text-violet-300 bg-violet-950/40'}`} title={`Task due: ${task.title}`}>
                      ☐ {task.title}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

interface CalendarEventEditorProps {
  event: ProductionCalendarEvent;
  people: Person[];
  onUpdate: (updates: Partial<ProductionCalendarEvent>) => void;
  onDelete: () => void;
  onClose: () => void;
  isLight: boolean;
}

/** Inline editor for one calendar event: dates, category, status, color, assignees, notes. */
export const CalendarEventEditor: React.FC<CalendarEventEditorProps> = ({ event, people, onUpdate, onDelete, onClose, isLight }) => {
  const inputCls = `min-h-[32px] w-full rounded-md border px-2 py-1 text-xs outline-none ${
    isLight ? 'border-slate-300 bg-white text-slate-800 focus:border-sky-400' : 'border-slate-700 bg-slate-950 text-slate-200 focus:border-sky-500'
  }`;
  const labelCls = `text-[9px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`;
  const assignees = event.assigneeIds ?? [];
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isLight ? 'border-sky-200 bg-sky-50/60' : 'border-sky-900/60 bg-sky-950/20'}`}>
      <div className="flex items-center gap-2">
        <input value={event.title} onChange={(e) => onUpdate({ title: e.target.value })} className={`${inputCls} font-semibold`} />
        <button onClick={onClose} className={`text-[10px] font-bold px-2 py-1 rounded border ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>Close</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="block space-y-1"><span className={labelCls}>Start</span>
          <input type="date" value={event.startDate} onChange={(e) => e.target.value && onUpdate({ startDate: e.target.value, endDate: event.endDate < e.target.value ? e.target.value : event.endDate })} className={inputCls} />
        </label>
        <label className="block space-y-1"><span className={labelCls}>End</span>
          <input type="date" value={event.endDate} min={event.startDate} onChange={(e) => e.target.value && e.target.value >= event.startDate && onUpdate({ endDate: e.target.value })} className={inputCls} />
        </label>
        <label className="block space-y-1"><span className={labelCls}>Category</span>
          <select value={event.category} onChange={(e) => onUpdate({ category: e.target.value as ProductionCalendarEvent['category'] })} className={inputCls}>
            {(Object.keys(EVENT_CATEGORY_LABELS) as Array<ProductionCalendarEvent['category']>).map((category) => <option key={category} value={category}>{EVENT_CATEGORY_LABELS[category]}</option>)}
          </select>
        </label>
        <label className="block space-y-1"><span className={labelCls}>Status</span>
          <select value={event.status ?? 'planned'} onChange={(e) => onUpdate({ status: e.target.value as ProductionCalendarEvent['status'] })} className={inputCls}>
            {(Object.keys(EVENT_STATUS_LABELS) as Array<NonNullable<ProductionCalendarEvent['status']>>).map((status) => <option key={status} value={status}>{EVENT_STATUS_LABELS[status]}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={labelCls}>Color</span>
        {EVENT_COLOR_SWATCHES.map((swatch) => (
          <button key={swatch} onClick={() => onUpdate({ color: swatch })} aria-pressed={(event.color ?? EVENT_COLOR_SWATCHES[0]) === swatch} className={`w-5 h-5 rounded-full border-2 ${(event.color ?? EVENT_COLOR_SWATCHES[0]) === swatch ? 'border-white ring-2 ring-sky-500' : 'border-transparent'}`} style={{ backgroundColor: swatch }} title={swatch} aria-label={swatch} />
        ))}
      </div>
      {people.length > 0 && (
        <div className="space-y-1">
          <span className={labelCls}>Assignees</span>
          <div className="flex flex-wrap gap-1">
            {people.map((person) => {
              const on = assignees.includes(person.id);
              return (
                <button
                  key={person.id}
                  onClick={() => onUpdate({ assigneeIds: on ? assignees.filter((id) => id !== person.id) : [...assignees, person.id] })}
                  aria-pressed={on}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${on ? 'bg-sky-600 text-white border-sky-500' : isLight ? 'border-slate-300 text-slate-600' : 'border-slate-700 text-slate-300'}`}
                >
                  {person.displayName}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <textarea value={event.notes ?? ''} onChange={(e) => onUpdate({ notes: e.target.value || undefined })} rows={2} placeholder="Notes…" className={`${inputCls} resize-y`} />
      <div className="flex justify-end">
        <button onClick={onDelete} className="px-2.5 py-1 rounded-lg border border-rose-500/40 text-rose-500 text-[11px] font-bold flex items-center gap-1 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5" /> Delete event</button>
      </div>
    </div>
  );
};
