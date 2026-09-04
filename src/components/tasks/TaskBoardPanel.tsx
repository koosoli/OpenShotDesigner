import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  KanbanSquare,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useDialogs } from '../dialog/DialogProvider';
import { createId } from '../../domain/ids';
import { groupPeopleByDepartment, personInitials } from '../../domain/people';
import type { Person } from '../../domain/people';
import { todayIso } from '../../domain/scheduling';
import type { Task, TaskBoard, TaskPriority } from '../../domain/tasks';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  addChecklistItem,
  addTask,
  boardLabels,
  checklistProgress,
  createTaskBoard,
  filterTasks,
  isTaskDueSoon,
  isTaskOverdue,
  moveTask,
  removeChecklistItem,
  removeTask,
  sortedColumns,
  summarizeBoard,
  tasksInColumn,
  toggleChecklistItem,
  updateTask,
} from '../../domain/tasks';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: 'bg-slate-400',
  normal: 'bg-sky-500',
  high: 'bg-amber-500',
  urgent: 'bg-rose-500',
};

const DND_TYPE = 'application/x-cineplan-task';

interface TaskEditorProps {
  task: Task;
  board: TaskBoard;
  people: Person[];
  onChange: (updates: Partial<Task>) => void;
  onChecklistAdd: (text: string) => void;
  onChecklistToggle: (itemId: string) => void;
  onChecklistRemove: (itemId: string) => void;
  onMove: (columnId: string) => void;
  onDelete: () => void;
  onClose: () => void;
  isLight: boolean;
}

const TaskEditor: React.FC<TaskEditorProps> = ({ task, board, people, onChange, onChecklistAdd, onChecklistToggle, onChecklistRemove, onMove, onDelete, onClose, isLight }) => {
  const [newItem, setNewItem] = useState('');
  const inputCls = `min-h-[32px] w-full rounded-md border px-2 py-1 text-xs outline-none ${
    isLight ? 'border-slate-300 bg-white text-slate-800 focus:border-sky-400' : 'border-slate-700 bg-slate-950 text-slate-200 focus:border-sky-500'
  }`;
  const labelCls = `text-[9px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`;
  const progress = checklistProgress(task);
  return (
    <div className={`rounded-xl border p-3 space-y-2.5 ${isLight ? 'border-sky-200 bg-sky-50/60' : 'border-sky-900/60 bg-sky-950/20'}`}>
      <div className="flex items-start gap-2">
        <input value={task.title} onChange={(e) => onChange({ title: e.target.value })} className={`${inputCls} font-semibold text-sm`} placeholder="Task title" />
        <button onClick={onClose} className={`p-1.5 rounded-md ${isLight ? 'hover:bg-slate-200' : 'hover:bg-slate-800'}`} title="Close" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>
      <textarea value={task.description ?? ''} onChange={(e) => onChange({ description: e.target.value || undefined })} rows={2} className={`${inputCls} resize-y`} placeholder="Details, links, what “done” means…" />
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className={labelCls}>Column</span>
          <select value={task.columnId} onChange={(e) => onMove(e.target.value)} className={inputCls}>
            {sortedColumns(board).map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={labelCls}>Priority</span>
          <select value={task.priority ?? 'normal'} onChange={(e) => onChange({ priority: e.target.value as TaskPriority })} className={inputCls}>
            {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{TASK_PRIORITY_LABELS[priority]}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={labelCls}>Due date</span>
          <input type="date" value={task.dueDate ?? ''} onChange={(e) => onChange({ dueDate: e.target.value || undefined })} className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className={labelCls}>Labels (comma separated)</span>
          <input
            value={task.labels.join(', ')}
            onChange={(e) => onChange({ labels: e.target.value.split(',').map((label) => label.trim()).filter(Boolean) })}
            className={inputCls}
            placeholder="locations, rental, urgent…"
          />
        </label>
      </div>
      <div className="space-y-1">
        <span className={labelCls}>
          Assignees{task.assigneeIds.length > 0 && ` · ${task.assigneeIds.length} assigned`}
        </span>
        {people.length === 0 ? (
          <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Add crew on the Crew tab to assign tasks to them.
          </p>
        ) : (
          /* Grouped by department: a real crew list is long, and "who in
             Lighting is on this?" is the question a task board gets asked. */
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {groupPeopleByDepartment(people).map((group) => (
              <div key={group.department} className="space-y-1">
                <span className={`text-[9px] font-black uppercase tracking-wider ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  {group.department}
                </span>
                <div className="flex flex-wrap gap-1">
                  {group.people.map((person) => {
                    const on = task.assigneeIds.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        title={person.role ? `${person.displayName} — ${person.role}` : person.displayName}
                        onClick={() => onChange({ assigneeIds: on ? task.assigneeIds.filter((id) => id !== person.id) : [...task.assigneeIds, person.id] })}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                          on ? 'bg-sky-600 text-white border-sky-500' : isLight ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {person.displayName}
                        {person.role && <span className="opacity-60 font-normal"> · {person.role}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <span className={labelCls}>Checklist {progress.total > 0 && `· ${progress.done}/${progress.total}`}</span>
        {task.checklist.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={item.done} onChange={() => onChecklistToggle(item.id)} className="accent-sky-600" />
            <span className={`flex-1 ${item.done ? 'line-through opacity-50' : ''}`}>{item.text}</span>
            <button
              onClick={() => onChecklistRemove(item.id)}
              className="p-0.5 text-slate-400 hover:text-rose-500"
              title={`Remove checklist item “${item.text}”`}
              aria-label={`Remove checklist item “${item.text}”`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newItem.trim()) return;
            onChecklistAdd(newItem);
            setNewItem('');
          }}
          className="flex items-center gap-1.5"
        >
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add checklist item…" className={inputCls} />
          <button
            type="submit"
            disabled={!newItem.trim()}
            className="px-2 min-h-[32px] rounded-md bg-sky-600 text-white text-xs font-bold disabled:opacity-40"
            title="Add checklist item"
            aria-label="Add checklist item"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          Created {task.createdAt.slice(0, 10)}{task.completedAt ? ` · done ${task.completedAt.slice(0, 10)}` : ''}
        </span>
        <button onClick={onDelete} className="px-2.5 py-1 rounded-lg border border-rose-500/40 text-rose-500 text-[11px] font-bold flex items-center gap-1 hover:bg-rose-500/10">
          <Trash2 className="w-3.5 h-3.5" /> Delete task
        </button>
      </div>
    </div>
  );
};

/**
 * Kanban task board (creative project management). Drag cards between
 * columns with the pointer, or use the ‹ › buttons on touch devices. All
 * mutations go through the pure `domain/tasks` logic.
 */
export const TaskBoardPanel: React.FC = () => {
  const { project, updateProjectMeta } = useFloorPlan();
  const { theme } = useWorkspaceUI();
  const { confirm } = useDialogs();
  const isLight = theme === 'light';
  const boards = useMemo(() => project.taskBoards ?? [], [project.taskBoards]);
  const allTasks = useMemo(() => project.tasks ?? [], [project.tasks]);
  const people = useMemo(() => project.people ?? [], [project.people]);
  const today = todayIso();

  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const board = boards.find((candidate) => candidate.id === activeBoardId) ?? boards[0] ?? null;
  const [query, setQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [labelFilter, setLabelFilter] = useState<string>('all');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const boardTasks = useMemo(() => (board ? allTasks.filter((task) => task.boardId === board.id) : []), [allTasks, board]);
  const visibleTasks = useMemo(
    () => filterTasks(boardTasks, { query, assigneeId: assigneeFilter, label: labelFilter }),
    [boardTasks, query, assigneeFilter, labelFilter],
  );
  const labels = useMemo(() => boardLabels(boardTasks), [boardTasks]);
  const summary = board ? summarizeBoard(allTasks, board, today) : null;
  const editingTask = allTasks.find((task) => task.id === editingTaskId) ?? null;

  const setTasks = (tasks: Task[]) => updateProjectMeta({ tasks });

  const createBoard = () => {
    const next = createTaskBoard(createId('board'), boards.length === 0 ? 'Production tasks' : `Board ${boards.length + 1}`);
    updateProjectMeta((prev) => ({ taskBoards: [...(prev.taskBoards ?? []), next] }));
    setActiveBoardId(next.id);
  };

  const renameBoard = (title: string) => {
    if (!board) return;
    updateProjectMeta((prev) => ({
      taskBoards: (prev.taskBoards ?? []).map((candidate) =>
        candidate.id === board.id ? { ...candidate, title } : candidate,
      ),
    }));
  };

  const deleteBoard = () => {
    if (!board) return;
    const target = board;
    const taskCount = boardTasks.length;
    void confirm({
      title: 'Delete board?',
      message: `Delete board “${target.title}” and its ${taskCount} task(s)?`,
      confirmLabel: 'Delete',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      updateProjectMeta((prev) => ({
        taskBoards: (prev.taskBoards ?? []).filter((candidate) => candidate.id !== target.id),
        tasks: (prev.tasks ?? []).filter((task) => task.boardId !== target.id),
      }));
      setActiveBoardId(null);
    });
  };

  const submitDraft = (columnId: string) => {
    if (!board) return;
    const title = (drafts[columnId] ?? '').trim();
    if (!title) return;
    const { tasks } = addTask(allTasks, board, { title, columnId }, new Date().toISOString());
    setTasks(tasks);
    setDrafts((current) => ({ ...current, [columnId]: '' }));
  };

  const move = (taskId: string, columnId: string, index: number) => {
    if (!board) return;
    setTasks(moveTask(allTasks, board, taskId, columnId, index, new Date().toISOString()));
  };

  const handleDrop = (e: React.DragEvent, columnId: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData(DND_TYPE);
    if (taskId) move(taskId, columnId, index);
  };

  const mutedCls = isLight ? 'text-slate-500' : 'text-slate-400';
  const inputCls = `min-h-[34px] rounded-md border px-2 py-1 text-xs outline-none ${
    isLight ? 'border-slate-200 bg-white text-slate-800 focus:border-sky-400' : 'border-slate-700 bg-slate-950/60 text-slate-200 focus:border-sky-500'
  }`;
  const btnCls = `min-h-[34px] flex items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
    isLight ? 'bg-slate-200/80 text-slate-700 hover:bg-slate-300/80' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
  }`;

  if (!board) {
    return (
      <div className={`h-full grid place-items-center p-8 ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
        <div className="max-w-sm text-center">
          <KanbanSquare className="w-10 h-10 mx-auto mb-3 text-sky-500" />
          <h3 className="font-semibold">No task board yet</h3>
          <p className={`text-sm mt-1 ${mutedCls}`}>Track prep, shoot and post to-dos with due dates, assignees and checklists — drag cards across columns as work moves.</p>
          <button onClick={createBoard} className="mt-4 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold">Create a board</button>
        </div>
      </div>
    );
  }

  const columns = sortedColumns(board);

  return (
    <div className={`h-full flex flex-col ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
      <div className={`p-3 space-y-2 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <KanbanSquare className="w-4 h-4 text-sky-500" />
          <select value={board.id} onChange={(e) => setActiveBoardId(e.target.value)} className={`${inputCls} font-semibold`} title="Select board">
            {boards.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
          </select>
          <input value={board.title} onChange={(e) => renameBoard(e.target.value)} className={`${inputCls} w-44`} title="Board name" />
          <button onClick={createBoard} className={btnCls}><Plus className="w-3.5 h-3.5" /> New board</button>
          <button onClick={deleteBoard} className={`min-h-[34px] min-w-[34px] grid place-items-center rounded-md ${isLight ? 'text-slate-500 hover:bg-red-50 hover:text-red-600' : 'text-slate-400 hover:bg-red-950/40 hover:text-red-400'}`} title="Delete board" aria-label="Delete board"><Trash2 className="w-4 h-4" /></button>
          {summary && (
            <span className={`ml-auto text-[10px] font-mono flex items-center gap-2 ${mutedCls}`}>
              <span>{summary.done}/{summary.total} done</span>
              {summary.overdue > 0 && <span className="text-rose-500 font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{summary.overdue} overdue</span>}
              {summary.dueSoon > 0 && <span className="text-amber-500 font-bold">{summary.dueSoon} due soon</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…" className={`${inputCls} w-full !pl-7`} />
          </div>
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className={inputCls}>
            <option value="all">Everyone</option>
            <option value="unassigned">Unassigned</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </select>
          <select value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)} className={inputCls}>
            <option value="all">All labels</option>
            {labels.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </div>
      </div>

      {editingTask && (
        <div className="p-3 pb-0">
          <TaskEditor
            task={editingTask}
            board={board}
            people={people}
            isLight={isLight}
            onChange={(updates) => setTasks(updateTask(allTasks, editingTask.id, updates))}
            onChecklistAdd={(text) => setTasks(addChecklistItem(allTasks, editingTask.id, text))}
            onChecklistToggle={(itemId) => setTasks(toggleChecklistItem(allTasks, editingTask.id, itemId))}
            onChecklistRemove={(itemId) => setTasks(removeChecklistItem(allTasks, editingTask.id, itemId))}
            onMove={(columnId) => move(editingTask.id, columnId, Number.MAX_SAFE_INTEGER)}
            onDelete={() => {
              setTasks(removeTask(allTasks, editingTask.id));
              setEditingTaskId(null);
            }}
            onClose={() => setEditingTaskId(null)}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3">
        <div className="flex gap-3 h-full min-w-max">
          {columns.map((column, columnIndex) => {
            const cards = tasksInColumn(visibleTasks, column.id);
            const isOver = dragOverColumn === column.id;
            return (
              <section
                key={column.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverColumn(column.id);
                }}
                onDragLeave={() => setDragOverColumn((current) => (current === column.id ? null : current))}
                onDrop={(e) => handleDrop(e, column.id, Number.MAX_SAFE_INTEGER)}
                className={`w-64 flex-shrink-0 flex flex-col rounded-xl border transition-colors ${
                  isOver ? 'border-sky-400 ring-2 ring-sky-400/30' : isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/40'
                }`}
              >
                <header className="px-2.5 pt-2.5 pb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                    {column.isDone && <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />}
                    {column.title}
                  </span>
                  <span className={`text-[10px] font-mono px-1.5 rounded-full ${isLight ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400'}`}>{cards.length}</span>
                </header>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 space-y-1.5">
                  {cards.map((task, index) => {
                    const overdue = isTaskOverdue(task, today);
                    const dueSoon = isTaskDueSoon(task, today);
                    const progress = checklistProgress(task);
                    const assignees = task.assigneeIds.map((id) => people.find((person) => person.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
                    return (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DND_TYPE, task.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverColumn(column.id);
                        }}
                        onDrop={(e) => handleDrop(e, column.id, index)}
                        onClick={() => setEditingTaskId(task.id)}
                        className={`rounded-lg border p-2 cursor-grab active:cursor-grabbing space-y-1.5 ${
                          editingTaskId === task.id ? 'border-sky-500 ring-1 ring-sky-500/40' : isLight ? 'border-slate-200 bg-white hover:border-slate-300' : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                        } ${task.completedAt ? 'opacity-70' : ''}`}
                      >
                        <div className="flex items-start gap-1.5">
                          <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority ?? 'normal']}`} title={`Priority: ${TASK_PRIORITY_LABELS[task.priority ?? 'normal']}`} />
                          <p className={`text-xs font-semibold leading-snug flex-1 ${task.completedAt ? 'line-through' : ''}`}>{task.title}</p>
                        </div>
                        {(task.dueDate || progress.total > 0 || task.labels.length > 0 || assignees.length > 0) && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {task.dueDate && (
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                overdue ? 'bg-rose-500/15 text-rose-500' : dueSoon ? 'bg-amber-500/15 text-amber-500' : isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-400'
                              }`}>
                                <CalendarDays className="w-3 h-3" />{task.dueDate.slice(5)}
                              </span>
                            )}
                            {progress.total > 0 && (
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 ${progress.done === progress.total ? 'bg-emerald-500/15 text-emerald-500' : isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-400'}`}>
                                <CheckSquare className="w-3 h-3" />{progress.done}/{progress.total}
                              </span>
                            )}
                            {task.labels.map((label) => (
                              <span key={label} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-500 flex items-center gap-0.5"><Tag className="w-2.5 h-2.5" />{label}</span>
                            ))}
                            {assignees.length > 0 && (
                              <span className="ml-auto flex -space-x-1">
                                {assignees.slice(0, 3).map((person) => (
                                  <span key={person.id} title={person.displayName} className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-500 text-[8px] font-black grid place-items-center border border-white dark:border-slate-900">
                                    {personInitials(person)}
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (columns[columnIndex - 1]) move(task.id, columns[columnIndex - 1].id, Number.MAX_SAFE_INTEGER);
                            }}
                            disabled={columnIndex === 0}
                            className={`p-0.5 rounded disabled:opacity-20 ${mutedCls}`}
                            title="Move to previous column"
                            aria-label="Move to previous column"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (columns[columnIndex + 1]) move(task.id, columns[columnIndex + 1].id, Number.MAX_SAFE_INTEGER);
                            }}
                            disabled={columnIndex === columns.length - 1}
                            className={`p-0.5 rounded disabled:opacity-20 ${mutedCls}`}
                            title="Move to next column"
                            aria-label="Move to next column"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitDraft(column.id);
                  }}
                  className="p-2 flex items-center gap-1"
                >
                  <input
                    value={drafts[column.id] ?? ''}
                    onChange={(e) => setDrafts((current) => ({ ...current, [column.id]: e.target.value }))}
                    placeholder="Add a task…"
                    className={`${inputCls} flex-1 min-w-0 !min-h-[30px]`}
                  />
                  <button type="submit" disabled={!(drafts[column.id] ?? '').trim()} className="min-h-[30px] px-2 rounded-md bg-sky-600 text-white disabled:opacity-40" title="Add task" aria-label="Add task">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </form>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
