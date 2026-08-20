import React, { useMemo, useState } from 'react';
import {
  Anchor,
  BatteryCharging,
  Boxes,
  Cable,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Edit2,
  FileSpreadsheet,
  Filter,
  HelpCircle,
  Info,
  LayoutGrid,
  Layers,
  Mic,
  Package,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  Table,
  Trash2,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { EquipmentCategory, EquipmentItem, EquipmentPackageItem, MasterEquipmentItem } from '../../types';
import {
  CAMERA_PACKAGE_PRESETS,
  DEPARTMENT_BRANDS_CATALOG,
  EQUIPMENT_CATEGORIES,
  EquipmentPreset,
  QUICK_EQUIPMENT_PRESETS,
  deriveAllScenesEquipment,
  deriveSceneEquipment,
  getBrandsForCategory,
  getCategoryMeta,
  getModelsForBrand,
} from '../../utils/equipmentList';
import { exportEquipmentToCsv } from '../../utils/exportEquipmentCsv';

export const EquipmentPanel: React.FC = () => {
  const {
    activeSetup,
    project,
    addCustomEquipmentItem,
    updateEquipmentItem,
    deleteEquipmentItem,
    resetSceneEquipment,
    addPackageItem,
    updatePackageItem,
    deletePackageItem,
    openExportModal,
    theme,
  } = useFloorPlan();

  const isLight = theme === 'light';

  // Scope: 'current' scene or 'all' scenes master manifest
  const [scope, setScope] = useState<'current' | 'all'>('current');
  // View style: 'spreadsheet' (default) or 'cards'
  const [viewStyle, setViewStyle] = useState<'spreadsheet' | 'cards'>('spreadsheet');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<EquipmentCategory | 'all'>('all');
  const [isPresetDrawerOpen, setIsPresetDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Expand / collapse state for packages (defaults to collapsed)
  const [expandedPackages, setExpandedPackages] = useState<Record<string, boolean>>({});

  // Package modal state for adding an accessory to a specific package
  const [activePackageTargetId, setActivePackageTargetId] = useState<string | null>(null);
  const [isAddPackageItemModalOpen, setIsAddPackageItemModalOpen] = useState(false);
  const [packageFormData, setPackageFormData] = useState<{
    category: EquipmentCategory;
    name: string;
    brand: string;
    model: string;
    quantity: number;
    roleOrFunction: string;
    specs: string;
  }>({
    category: 'power_media',
    name: 'V-Mount Batteries (4-Pack) & Charger',
    brand: 'Anton Bauer',
    model: 'Titon 150 V-Mount (156Wh)',
    quantity: 4,
    roleOrFunction: 'Camera Power',
    specs: '14.4V High-Draw · Quad Fast Charger',
  });

  // Form state for general add / edit modal
  const [formData, setFormData] = useState<{
    category: EquipmentCategory;
    name: string;
    brand: string;
    model: string;
    quantity: number;
    roleOrFunction: string;
    specs: string;
    notes: string;
    targetPackageId?: string; // Optional: target package to attach to
  }>({
    category: 'camera',
    name: '',
    brand: '',
    model: '',
    quantity: 1,
    roleOrFunction: '',
    specs: '',
    notes: '',
    targetPackageId: '',
  });

  const togglePackageExpand = (id: string) => {
    setExpandedPackages((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Derive current scene equipment vs all scenes equipment
  const currentSceneEquipment = useMemo(
    () => deriveSceneEquipment(activeSetup),
    [activeSetup]
  );

  const allScenesEquipment = useMemo(
    () => deriveAllScenesEquipment(project.setups || [activeSetup]),
    [project.setups, activeSetup]
  );

  // Available camera packages in current scene for target dropdown
  const availableCameraPackages = useMemo(() => {
    return currentSceneEquipment.filter(
      (item) => item.isPackage || item.name.includes('Package') || item.category === 'camera'
    );
  }, [currentSceneEquipment]);

  // Active dataset based on scope
  const activeItems: (EquipmentItem | MasterEquipmentItem)[] =
    scope === 'current' ? currentSceneEquipment : allScenesEquipment;

  // Filtered by category & search query
  const filteredItems = useMemo(() => {
    return activeItems.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchBrand = (item.brand || '').toLowerCase().includes(q);
      const matchModel = (item.model || '').toLowerCase().includes(q);
      const matchRole = (item.roleOrFunction || '').toLowerCase().includes(q);
      const matchSpecs = (item.specs || '').toLowerCase().includes(q);
      const matchCategory = item.category.toLowerCase().includes(q);

      // Search nested package items as well
      const matchPackage = (item.packageItems || []).some(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.brand || '').toLowerCase().includes(q) ||
          (p.model || '').toLowerCase().includes(q) ||
          (p.specs || '').toLowerCase().includes(q)
      );

      let matchScenes = false;
      if ('usedInSetups' in item) {
        matchScenes = item.usedInSetups.some(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.sceneNumber && s.sceneNumber.toLowerCase().includes(q))
        );
      }

      return matchName || matchBrand || matchModel || matchRole || matchSpecs || matchCategory || matchPackage || matchScenes;
    });
  }, [activeItems, selectedCategory, searchQuery]);

  // Group filtered items by rubric category
  const groupedItems = useMemo(() => {
    const map = new Map<EquipmentCategory, (EquipmentItem | MasterEquipmentItem)[]>();
    EQUIPMENT_CATEGORIES.forEach((cat) => map.set(cat.key, []));

    filteredItems.forEach((item) => {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    });

    return map;
  }, [filteredItems]);

  // Summary counts (including sub-package items)
  const totalItemCount = useMemo(() => {
    return activeItems.reduce((sum, item) => {
      let subSum = 0;
      if (item.packageItems) {
        subSum = item.packageItems.reduce((s, p) => s + p.quantity, 0);
      }
      return sum + item.quantity + subSum;
    }, 0);
  }, [activeItems]);

  const totalUniqueCount = useMemo(() => {
    return activeItems.reduce((count, item) => {
      return count + 1 + (item.packageItems ? item.packageItems.length : 0);
    }, 0);
  }, [activeItems]);

  const getCategoryIcon = (category: EquipmentCategory, className = 'w-4 h-4') => {
    switch (category) {
      case 'camera':
        return <Camera className={className} />;
      case 'lighting':
        return <Sun className={className} />;
      case 'grip':
        return <Anchor className={className} />;
      case 'audio':
        return <Mic className={className} />;
      case 'power_media':
        return <BatteryCharging className={className} />;
      case 'cables':
        return <Cable className={className} />;
      case 'props':
        return <Package className={className} />;
      case 'expendables':
        return <Sparkles className={className} />;
      default:
        return <Boxes className={className} />;
    }
  };

  const openAddModal = (presetCategory?: EquipmentCategory) => {
    const cat = presetCategory || (selectedCategory !== 'all' ? selectedCategory : 'lighting');
    const defaultBrand = getBrandsForCategory(cat)[0] || '';
    const defaultModel = getModelsForBrand(cat, defaultBrand)[0] || '';

    setEditingItem(null);
    setFormData({
      category: cat,
      name: defaultModel || '',
      brand: defaultBrand,
      model: defaultModel,
      quantity: 1,
      roleOrFunction: '',
      specs: '',
      notes: '',
      targetPackageId: '',
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (item: EquipmentItem) => {
    setEditingItem(item);
    setFormData({
      category: item.category,
      name: item.name,
      brand: item.brand || '',
      model: item.model || '',
      quantity: item.quantity,
      roleOrFunction: item.roleOrFunction || '',
      specs: item.specs || '',
      notes: item.notes || '',
      targetPackageId: '',
    });
    setIsAddModalOpen(true);
  };

  const openAddPackageItemModal = (packageId: string) => {
    setActivePackageTargetId(packageId);
    const defaultPreset = CAMERA_PACKAGE_PRESETS[0];
    setPackageFormData({
      category: defaultPreset.category,
      name: defaultPreset.name,
      brand: defaultPreset.brand,
      model: defaultPreset.model,
      quantity: defaultPreset.quantity,
      roleOrFunction: defaultPreset.roleOrFunction,
      specs: defaultPreset.specs,
    });
    setIsAddPackageItemModalOpen(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (formData.targetPackageId) {
      // User selected to attach this item into a specific camera package
      addPackageItem(formData.targetPackageId, {
        category: formData.category,
        name: formData.name.trim(),
        brand: formData.brand.trim() || undefined,
        model: formData.model.trim() || undefined,
        quantity: Math.max(1, Number(formData.quantity) || 1),
        roleOrFunction: formData.roleOrFunction.trim() || undefined,
        specs: formData.specs.trim() || undefined,
      });
      setExpandedPackages((prev) => ({ ...prev, [formData.targetPackageId!]: true }));
    } else if (editingItem) {
      updateEquipmentItem(editingItem.id, {
        category: formData.category,
        name: formData.name.trim(),
        brand: formData.brand.trim() || undefined,
        model: formData.model.trim() || undefined,
        quantity: Math.max(1, Number(formData.quantity) || 1),
        roleOrFunction: formData.roleOrFunction.trim() || undefined,
        specs: formData.specs.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });
    } else {
      addCustomEquipmentItem({
        category: formData.category,
        name: formData.name.trim(),
        brand: formData.brand.trim() || undefined,
        model: formData.model.trim() || undefined,
        quantity: Math.max(1, Number(formData.quantity) || 1),
        roleOrFunction: formData.roleOrFunction.trim() || undefined,
        specs: formData.specs.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });
    }

    setIsAddModalOpen(false);
    setEditingItem(null);
  };

  const handleSavePackageItemModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePackageTargetId || !packageFormData.name.trim()) return;

    addPackageItem(activePackageTargetId, {
      category: packageFormData.category,
      name: packageFormData.name.trim(),
      brand: packageFormData.brand.trim() || undefined,
      model: packageFormData.model.trim() || undefined,
      quantity: Math.max(1, Number(packageFormData.quantity) || 1),
      roleOrFunction: packageFormData.roleOrFunction.trim() || undefined,
      specs: packageFormData.specs.trim() || undefined,
    });

    setExpandedPackages((prev) => ({ ...prev, [activePackageTargetId]: true }));
    setIsAddPackageItemModalOpen(false);
    setActivePackageTargetId(null);
  };

  const handleAddPreset = (preset: EquipmentPreset) => {
    addCustomEquipmentItem({
      category: preset.category,
      name: preset.name,
      brand: preset.brand,
      model: preset.model,
      quantity: preset.quantity,
      roleOrFunction: preset.roleOrFunction,
      specs: preset.specs,
    });
  };

  const handleAddPackagePreset = (packageId: string, preset: (typeof CAMERA_PACKAGE_PRESETS)[0]) => {
    addPackageItem(packageId, {
      category: preset.category,
      name: preset.name,
      brand: preset.brand,
      model: preset.model,
      quantity: preset.quantity,
      roleOrFunction: preset.roleOrFunction,
      specs: preset.specs,
    });
    setExpandedPackages((prev) => ({ ...prev, [packageId]: true }));
  };

  const handleExportCsv = () => {
    exportEquipmentToCsv(
      activeSetup,
      project.title,
      scope,
      project.setups || [activeSetup]
    );
  };

  const cardBg = isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100';
  const rowBg = isLight ? 'bg-slate-50/80 border-slate-200 hover:bg-slate-100/80' : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50';
  const inputClass = `w-full bg-transparent focus:bg-white dark:focus:bg-slate-800 rounded px-1.5 py-1 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-sky-500 focus:outline-hidden transition-all`;

  return (
    <div className={`h-full flex flex-col min-h-0 ${isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}`}>
      {/* 1. Header Toolbar */}
      <div className={`p-2.5 border-b flex flex-col gap-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/40'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span>Equipment Manifest</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-sky-500/15 text-sky-400 font-bold">
                  {totalItemCount} total units · {totalUniqueCount} gear items
                </span>
              </h2>
              <p className="text-[10px] opacity-60">
                {scope === 'current'
                  ? `Scene ${activeSetup.sceneNumber || '1'} (${activeSetup.name}) — Camera packages are expandable kits`
                  : `Master production truck package across all ${project.setups?.length || 1} scenes`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* View Mode Toggle: Spreadsheet (Default) vs Cards */}
            <div className="flex items-center rounded-lg border p-0.5 text-[11px] font-semibold">
              <button
                onClick={() => setViewStyle('spreadsheet')}
                title="Spreadsheet Data Grid view (Default)"
                className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${
                  viewStyle === 'spreadsheet'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Table className="w-3 h-3" />
                <span className="hidden sm:inline">Spreadsheet</span>
              </button>
              <button
                onClick={() => setViewStyle('cards')}
                title="Department Rubric Cards view"
                className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${
                  viewStyle === 'cards'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>

            {/* Scope Selector: Current Scene vs All Scenes */}
            <div className="flex items-center rounded-lg border p-0.5 text-[11px] font-semibold">
              <button
                onClick={() => setScope('current')}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                  scope === 'current'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Current Scene</span>
                <span className="text-[9px] opacity-75 font-mono">({activeSetup.sceneNumber || '1'})</span>
              </button>
              <button
                onClick={() => setScope('all')}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                  scope === 'all'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>All Scenes</span>
                <span className="text-[9px] opacity-75 font-mono">({project.setups?.length || 1})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Action Controls & Fast Add */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[140px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
            <input
              type="text"
              placeholder="Search gear, brand, model, package, batteries, cards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-8 pr-7 py-1 text-xs rounded-lg border focus:outline-hidden focus:ring-1 focus:ring-sky-500 ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick Presets Toggle */}
          <button
            onClick={() => setIsPresetDrawerOpen((prev) => !prev)}
            title="Fast-add common production gear (Batteries, SD cards, Cables, Tape, Clamps)"
            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors ${
              isPresetDrawerOpen
                ? 'bg-amber-500 text-black border-amber-400 shadow-xs'
                : isLight
                  ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  : 'border-slate-700 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fast Add</span>
            {isPresetDrawerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Add Custom Gear Button */}
          {scope === 'current' && (
            <button
              onClick={() => openAddModal()}
              title="Add custom production item"
              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Gear</span>
            </button>
          )}

          {/* Export to CSV / Excel Spreadsheet */}
          <button
            onClick={handleExportCsv}
            title={`Download ${
              scope === 'all' ? 'All Scenes Master Truck' : `Scene ${activeSetup.sceneNumber || '1'}`
            } as an Excel / CSV spreadsheet`}
            className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV Export</span>
          </button>

          {/* Export / Print Gear Manifest */}
          <button
            onClick={() => openExportModal('equipment')}
            title="Export / print the equipment package manifest"
            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 ${
              isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>

          {/* Reset scene overrides */}
          {scope === 'current' && (activeSetup.customEquipment || []).length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Reset this scene’s equipment list to live floor plan elements?')) {
                  resetSceneEquipment();
                }
              }}
              title="Reset scene equipment to floor plan canvas defaults"
              className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 2. Fast Add Presets Drawer */}
        {isPresetDrawerOpen && (
          <div
            className={`p-2.5 rounded-xl border flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 ${
              isLight ? 'bg-amber-50/70 border-amber-200 text-amber-950' : 'bg-amber-950/20 border-amber-900/50 text-amber-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Fast-Add Production Presets</span>
              </div>
              <span className="text-[10px] opacity-60">Click any preset to add it to Scene {activeSetup.sceneNumber || '1'}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
              {QUICK_EQUIPMENT_PRESETS.map((preset, idx) => {
                const meta = getCategoryMeta(preset.category);
                return (
                  <button
                    key={idx}
                    onClick={() => handleAddPreset(preset)}
                    className={`p-1.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all group ${
                      isLight
                        ? 'bg-white border-amber-200/80 hover:border-amber-500 hover:shadow-xs text-slate-800'
                        : 'bg-slate-900 border-amber-800/40 hover:border-amber-500 hover:bg-slate-850 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold truncate group-hover:text-amber-500">
                        {preset.name}
                      </span>
                      <span className="font-mono text-[9px] font-bold opacity-60 flex-shrink-0">
                        ×{preset.quantity}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] opacity-60">
                      <span>{meta.shortLabel}</span>
                      {preset.brand && <span>· {preset.brand}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Department Rubrics Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5 pt-0.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors flex items-center gap-1 ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : isLight
                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>All Departments</span>
            <span className="font-mono text-[9px] opacity-75">({totalItemCount})</span>
          </button>

          {EQUIPMENT_CATEGORIES.map((cat) => {
            const count = (groupedItems.get(cat.key) || []).reduce((sum, item) => {
              const subSum = (item.packageItems || []).filter((p) => p.category === cat.key).reduce((s, p) => s + p.quantity, 0);
              return sum + (item.category === cat.key ? item.quantity : 0) + subSum;
            }, 0);

            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors flex items-center gap-1 ${
                  selectedCategory === cat.key
                    ? `${cat.badgeBg} ${cat.badgeText} ring-1 ring-current shadow-xs`
                    : isLight
                      ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {getCategoryIcon(cat.key, 'w-2.5 h-2.5')}
                <span>{cat.shortLabel}</span>
                <span className="font-mono text-[9px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>

        {/* 4. Interactive Editing Hint Banner */}
        <div
          className={`px-3 py-1.5 rounded-lg border flex items-center justify-between gap-2 text-[11px] ${
            scope === 'current'
              ? isLight
                ? 'bg-sky-50/80 border-sky-200 text-sky-900'
                : 'bg-sky-950/30 border-sky-800 text-sky-200'
              : isLight
                ? 'bg-violet-50/80 border-violet-200 text-violet-900'
                : 'bg-violet-950/30 border-violet-800 text-violet-200'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 text-sky-500" />
            <span>
              {scope === 'current'
                ? '📦 Click "Open Kit" or "+ Add Gear to Kit" on any camera package to attach batteries, memory cards, monitors, follow focus, and accessories.'
                : '🔒 All Scenes master truck is a consolidated summary across the entire project.'}
            </span>
          </div>
          {scope === 'current' && (
            <span className="text-[10px] font-semibold opacity-70 hidden sm:inline">
              Double-click row to open full editor
            </span>
          )}
        </div>
      </div>

      {/* 5. Equipment Main Content: Spreadsheet View (Default) vs Rubric Cards */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5">
        {/* Render HTML5 datalists for all department brand & model templates */}
        {EQUIPMENT_CATEGORIES.map((cat) => {
          const brandList = getBrandsForCategory(cat.key);
          return (
            <datalist key={`dl-brand-${cat.key}`} id={`brand-datalist-${cat.key}`}>
              {brandList.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          );
        })}

        {filteredItems.length === 0 ? (
          <div className={`m-4 p-8 text-center border border-dashed rounded-2xl ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>
            <Boxes className="w-10 h-10 mx-auto mb-2 opacity-30 text-sky-500" />
            <p className="text-xs font-semibold">No equipment found</p>
            <p className="text-[11px] opacity-60 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? `No gear matching "${searchQuery}". Clear your search or add a custom item.`
                : 'Add cameras, lights, or props on the floor plan, or click “Add Gear” / “Fast Add” to attach batteries, cables, and production supplies.'}
            </p>
            {scope === 'current' && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  onClick={() => openAddModal()}
                  className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add First Item
                </button>
                <button
                  onClick={() => setIsPresetDrawerOpen(true)}
                  className="px-3 py-1 rounded-lg border border-amber-500/40 text-amber-400 text-xs font-semibold flex items-center gap-1 hover:bg-amber-500/10"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Fast Presets
                </button>
              </div>
            )}
          </div>
        ) : viewStyle === 'spreadsheet' ? (
          /* ========================================================================= */
          /* SPREADSHEET DATA GRID VIEW (WITH PROMINENT OPENABLE CAMERA PACKAGES)      */
          /* ========================================================================= */
          <div className={`border rounded-xl overflow-hidden shadow-xs ${cardBg}`}>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse font-sans">
                <thead>
                  <tr
                    className={`border-b text-[10px] font-mono uppercase font-bold sticky top-0 z-10 ${
                      isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    <th className="p-2 w-28 whitespace-nowrap">DEPARTMENT</th>
                    <th className="p-2 min-w-[220px]">ITEM & PACKAGE NAME</th>
                    <th className="p-2 min-w-[130px]">BRAND</th>
                    <th className="p-2 min-w-[150px]">MODEL / VARIANT</th>
                    <th className="p-2 w-28 text-center">QTY</th>
                    <th className="p-2 min-w-[140px]">ROLE / FUNCTION</th>
                    <th className="p-2 min-w-[200px]">TECHNICAL SPECS & NOTES</th>
                    {scope === 'all' && (
                      <th className="p-2 min-w-[160px] font-mono text-[9px]">SCENE USAGE & PEAK</th>
                    )}
                    {scope === 'current' && <th className="p-2 w-28 text-right pr-3">ACTIONS</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                  {filteredItems.map((item) => {
                    const meta = getCategoryMeta(item.category);
                    const isMaster = 'usedInSetups' in item;
                    const masterItem = isMaster ? (item as MasterEquipmentItem) : null;
                    const isEditable = scope === 'current';
                    const isPackage = item.isPackage || (item.packageItems && item.packageItems.length > 0) || item.name.includes('Package');
                    const isExpanded = !!expandedPackages[item.id];
                    const packageItems = item.packageItems || [];

                    // Models available for this item's category & brand
                    const modelOptions = getModelsForBrand(item.category, item.brand || '');

                    return (
                      <React.Fragment key={item.id}>
                        {/* MAIN ITEM ROW */}
                        <tr
                          onDoubleClick={() => {
                            if (isEditable) openEditModal(item);
                          }}
                          className={`transition-colors group ${
                            isPackage
                              ? isExpanded
                                ? isLight
                                  ? 'bg-sky-100/60 border-b border-sky-300'
                                  : 'bg-sky-950/40 border-b border-sky-800'
                                : isLight
                                  ? 'bg-sky-50/40 hover:bg-sky-50/80'
                                  : 'bg-sky-950/20 hover:bg-sky-950/40'
                              : isLight
                                ? 'hover:bg-slate-50/80 odd:bg-white even:bg-slate-50/30'
                                : 'hover:bg-slate-850/50 odd:bg-slate-900 even:bg-slate-950/30'
                          }`}
                        >
                          {/* 1. Department Selector / Badge */}
                          <td className="p-2 align-middle">
                            {isEditable ? (
                              <select
                                value={item.category}
                                onChange={(e) => {
                                  const newCat = e.target.value as EquipmentCategory;
                                  const firstBrand = getBrandsForCategory(newCat)[0] || item.brand;
                                  const firstModel = getModelsForBrand(newCat, firstBrand || '')[0] || item.model;
                                  updateEquipmentItem(item.id, {
                                    category: newCat,
                                    brand: firstBrand,
                                    model: firstModel,
                                  });
                                }}
                                className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer ${meta.badgeBg} ${meta.badgeText}`}
                              >
                                {EQUIPMENT_CATEGORIES.map((c) => (
                                  <option key={c.key} value={c.key}>
                                    {c.shortLabel}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold inline-flex items-center gap-1 ${meta.badgeBg} ${meta.badgeText}`}
                              >
                                {getCategoryIcon(item.category, 'w-2.5 h-2.5')}
                                <span>{meta.shortLabel}</span>
                              </span>
                            )}
                          </td>

                          {/* 2. Item Name & Prominent Package Open / Add Triggers */}
                          <td className="p-2 align-middle">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Open Kit Button */}
                              {isPackage && (
                                <button
                                  onClick={() => togglePackageExpand(item.id)}
                                  title={isExpanded ? 'Collapse package kit components' : 'Open package to view & add batteries, media cards, monitors, etc.'}
                                  className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-xs ${
                                    isExpanded
                                      ? 'bg-sky-600 text-white ring-1 ring-sky-400'
                                      : 'bg-sky-500/15 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30'
                                  }`}
                                >
                                  <Package className="w-3.5 h-3.5" />
                                  <span>{isExpanded ? 'Close Kit' : 'Open Kit'}</span>
                                  <span className="font-mono text-[10px] opacity-80">({packageItems.length})</span>
                                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                              )}

                              {/* Quick "+ Add to Kit" button directly on row */}
                              {isPackage && isEditable && (
                                <button
                                  onClick={() => openAddPackageItemModal(item.id)}
                                  title={`Add batteries, media cards, monitor, or custom gear directly to ${item.name}`}
                                  className="px-2 py-1 rounded-lg bg-emerald-600/15 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 text-emerald-400 text-[11px] font-bold flex items-center gap-0.5 transition-all shadow-xs"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add Gear to Kit</span>
                                </button>
                              )}

                              {isEditable ? (
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) =>
                                    updateEquipmentItem(item.id, { name: e.target.value })
                                  }
                                  placeholder="Item name..."
                                  title="Click to edit item name"
                                  className={`${inputClass} font-bold text-xs`}
                                />
                              ) : (
                                <span className="font-bold text-xs">{item.name}</span>
                              )}

                              {item.isCustom ? (
                                <span className="px-1 py-0.2 rounded text-[8px] font-mono font-bold bg-violet-500/15 text-violet-400 border border-violet-500/30 flex-shrink-0">
                                  Custom
                                </span>
                              ) : (
                                <span className="px-1 py-0.2 rounded text-[8px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30 flex-shrink-0">
                                  Canvas
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 3. Brand (Drop-Down / Autocomplete) */}
                          <td className="p-2 align-middle">
                            {isEditable ? (
                              <input
                                type="text"
                                list={`brand-datalist-${item.category}`}
                                value={item.brand || ''}
                                onChange={(e) => {
                                  const newBrand = e.target.value;
                                  const models = getModelsForBrand(item.category, newBrand);
                                  updateEquipmentItem(item.id, {
                                    brand: newBrand,
                                    model: models.length > 0 && !models.includes(item.model || '') ? models[0] : item.model,
                                  });
                                }}
                                placeholder="Brand..."
                                title="Type or pick from template brands"
                                className={`${inputClass} font-semibold`}
                              />
                            ) : (
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {item.brand || <span className="opacity-30">—</span>}
                              </span>
                            )}
                          </td>

                          {/* 4. Model / Variant (Drop-Down / Autocomplete) */}
                          <td className="p-2 align-middle">
                            {isEditable ? (
                              <div>
                                <datalist id={`model-datalist-${item.id}`}>
                                  {modelOptions.map((m) => (
                                    <option key={m} value={m} />
                                  ))}
                                </datalist>
                                <input
                                  type="text"
                                  list={`model-datalist-${item.id}`}
                                  value={item.model || ''}
                                  onChange={(e) => {
                                    const newModel = e.target.value;
                                    const updates: Partial<EquipmentItem> = { model: newModel };
                                    if (!item.name || item.name.includes('Package') || item.name.includes('Custom')) {
                                      updates.name = newModel;
                                    }
                                    updateEquipmentItem(item.id, updates);
                                  }}
                                  placeholder="Model..."
                                  title="Type or pick from template models"
                                  className={`${inputClass} font-mono text-[11px]`}
                                />
                              </div>
                            ) : (
                              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                {item.model || <span className="opacity-30">—</span>}
                              </span>
                            )}
                          </td>

                          {/* 5. Quantity Stepper */}
                          <td className="p-2 align-middle text-center">
                            <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-black/5 dark:bg-black/40 overflow-hidden text-xs">
                              {isEditable && (
                                <button
                                  onClick={() =>
                                    updateEquipmentItem(item.id, {
                                      quantity: Math.max(1, item.quantity - 1),
                                    })
                                  }
                                  title="Decrease quantity"
                                  className="px-1.5 py-0.5 hover:bg-slate-500/20 transition-colors font-mono font-bold"
                                >
                                  -
                                </button>
                              )}
                              {isEditable ? (
                                <input
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updateEquipmentItem(item.id, {
                                      quantity: Math.max(1, Number(e.target.value) || 1),
                                    })
                                  }
                                  className="w-10 bg-transparent text-center font-mono font-black py-0.5 focus:outline-hidden"
                                />
                              ) : (
                                <span className="px-2 py-0.5 font-mono font-black text-center min-w-[26px]">
                                  {item.quantity}
                                </span>
                              )}
                              {isEditable && (
                                <button
                                  onClick={() =>
                                    updateEquipmentItem(item.id, {
                                      quantity: item.quantity + 1,
                                    })
                                  }
                                  title="Increase quantity"
                                  className="px-1.5 py-0.5 hover:bg-slate-500/20 transition-colors font-mono font-bold"
                                >
                                  +
                                </button>
                              )}
                            </div>
                          </td>

                          {/* 6. Role / Function */}
                          <td className="p-2 align-middle">
                            {isEditable ? (
                              <input
                                type="text"
                                value={item.roleOrFunction || ''}
                                onChange={(e) =>
                                  updateEquipmentItem(item.id, { roleOrFunction: e.target.value })
                                }
                                placeholder="Role / function..."
                                className={`${inputClass} text-xs`}
                              />
                            ) : (
                              <span className="text-slate-700 dark:text-slate-300">
                                {item.roleOrFunction || <span className="opacity-30">—</span>}
                              </span>
                            )}
                          </td>

                          {/* 7. Specs & Notes */}
                          <td className="p-2 align-middle">
                            {isEditable ? (
                              <input
                                type="text"
                                value={item.specs || item.notes || ''}
                                onChange={(e) =>
                                  updateEquipmentItem(item.id, { specs: e.target.value })
                                }
                                placeholder="Technical specs & notes..."
                                className={`${inputClass} text-[11px]`}
                              />
                            ) : (
                              <span className="text-[11px] text-slate-600 dark:text-slate-400">
                                {item.specs || item.notes || <span className="opacity-30">—</span>}
                              </span>
                            )}
                          </td>

                          {/* Master Scene Usage (All Scenes View) */}
                          {scope === 'all' && masterItem && (
                            <td className="p-2 align-middle text-[10px] font-mono text-slate-600 dark:text-slate-400">
                              <div className="flex flex-wrap gap-1 items-center">
                                {masterItem.usedInSetups.map((s, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className="px-1 py-0.2 rounded text-[9px] bg-violet-500/15 text-violet-300 border border-violet-500/20"
                                  >
                                    {s.sceneNumber ? `Sc ${s.sceneNumber}` : s.name} (×{s.quantity})
                                  </span>
                                ))}
                              </div>
                              <div className="text-[9px] opacity-60 mt-0.5">
                                Peak: {masterItem.maxConcurrentQuantity} concurrent
                              </div>
                            </td>
                          )}

                          {/* 8. Row Actions */}
                          {isEditable && (
                            <td className="p-2 align-middle text-right pr-3">
                              <div className="inline-flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                                <button
                                  onClick={() => openEditModal(item)}
                                  title="Open full edit modal"
                                  className="p-1 rounded hover:bg-sky-500/15 hover:text-sky-400 transition-colors"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() =>
                                    addCustomEquipmentItem({
                                      category: item.category,
                                      name: `${item.name} (Copy)`,
                                      brand: item.brand,
                                      model: item.model,
                                      quantity: item.quantity,
                                      roleOrFunction: item.roleOrFunction,
                                      specs: item.specs,
                                      notes: item.notes,
                                      isPackage: item.isPackage,
                                      packageItems: item.packageItems ? JSON.parse(JSON.stringify(item.packageItems)) : undefined,
                                    })
                                  }
                                  title="Duplicate item"
                                  className="p-1 rounded hover:bg-emerald-500/15 hover:text-emerald-400 transition-colors"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteEquipmentItem(item.id)}
                                  title="Delete item"
                                  className="p-1 rounded hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>

                        {/* ============================================================= */}
                        {/* NESTED OPENABLE PACKAGE KIT DRAWER (BATTERIES, CARDS, MONITORS)*/}
                        {/* ============================================================= */}
                        {isPackage && isExpanded && (
                          <tr className={isLight ? 'bg-sky-50/90 border-b-2 border-sky-300' : 'bg-slate-950/95 border-b-2 border-sky-800'}>
                            <td colSpan={scope === 'all' ? 8 : 8} className="p-0">
                              <div className="pl-6 pr-3 py-3 border-l-4 border-sky-500 flex flex-col gap-2.5">
                                {/* Kit Header Bar */}
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1 rounded-md bg-sky-500/20 text-sky-400">
                                      <Package className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <span className="text-xs font-black uppercase tracking-wider text-sky-400 font-mono flex items-center gap-1.5">
                                        <span>{item.name} — Kit Accessories Manifest</span>
                                        <span className="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 text-[10px]">
                                          {packageItems.length} components · {packageItems.reduce((s, p) => s + p.quantity, 0)} units
                                        </span>
                                      </span>
                                      <p className="text-[10px] opacity-70">
                                        Batteries, memory cards, on-camera monitors, wireless transmitters, follow focus systems & gear
                                      </p>
                                    </div>
                                  </div>

                                  {isEditable && (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => openAddPackageItemModal(item.id)}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-md transition-all"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>+ Add Custom Item to {item.name.split(' ')[0]}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* 1-Click Fast Presets Toolbar for this Camera Package */}
                                {isEditable && (
                                  <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold font-mono uppercase text-sky-400 flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-amber-400" />
                                        <span>1-Click Fast Presets (Click any button to immediately attach to {item.name}):</span>
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {CAMERA_PACKAGE_PRESETS.map((pkgPreset, pIdx) => (
                                        <button
                                          key={pIdx}
                                          onClick={() => handleAddPackagePreset(item.id, pkgPreset)}
                                          title={`Add ${pkgPreset.name} to ${item.name} (${pkgPreset.specs})`}
                                          className={`px-2.5 py-1 rounded-lg text-left border text-[10px] font-bold transition-all flex items-center gap-1 group shadow-xs ${
                                            isLight
                                              ? 'bg-white border-sky-300 hover:bg-sky-600 hover:text-white hover:border-sky-600 text-slate-800'
                                              : 'bg-slate-900 border-sky-800 hover:bg-sky-600 hover:text-white hover:border-sky-500 text-slate-200'
                                          }`}
                                        >
                                          <Plus className="w-3 h-3 text-sky-500 group-hover:text-white flex-shrink-0" />
                                          <span>{pkgPreset.name}</span>
                                          <span className="font-mono text-[9px] opacity-70 ml-0.5">x{pkgPreset.quantity}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Kit Sub-Items Table */}
                                <div className="border border-sky-500/30 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-md">
                                  <table className="w-full text-left text-xs border-collapse font-sans">
                                    <thead>
                                      <tr className={`border-b text-[10px] font-mono uppercase font-bold ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-950 text-slate-300'}`}>
                                        <th className="p-2 w-28">DEPARTMENT</th>
                                        <th className="p-2 min-w-[200px]">PACKAGE ACCESSORY / ITEM</th>
                                        <th className="p-2 min-w-[130px]">BRAND</th>
                                        <th className="p-2 min-w-[140px]">MODEL</th>
                                        <th className="p-2 w-28 text-center">QTY</th>
                                        <th className="p-2 min-w-[140px]">ROLE / FUNCTION</th>
                                        <th className="p-2 min-w-[200px]">TECHNICAL SPECS</th>
                                        {isEditable && <th className="p-2 w-20 text-right pr-3">ACTION</th>}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                      {packageItems.length === 0 ? (
                                        <tr>
                                          <td colSpan={8} className="p-6 text-center">
                                            <div className="max-w-md mx-auto flex flex-col items-center gap-2">
                                              <Package className="w-8 h-8 opacity-30 text-sky-400" />
                                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                This camera package has no items yet.
                                              </p>
                                              <p className="text-[11px] opacity-70">
                                                Click the preset buttons above (like <strong>V-Mount Batteries</strong> or <strong>CFexpress Cards</strong>) or click <strong>"+ Add Custom Item"</strong> below to load accessories.
                                              </p>
                                              {isEditable && (
                                                <div className="flex items-center gap-2 mt-1">
                                                  <button
                                                    onClick={() => handleAddPackagePreset(item.id, CAMERA_PACKAGE_PRESETS[0])}
                                                    className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                                                  >
                                                    <Plus className="w-3 h-3" /> + Add Batteries
                                                  </button>
                                                  <button
                                                    onClick={() => handleAddPackagePreset(item.id, CAMERA_PACKAGE_PRESETS[2])}
                                                    className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                                                  >
                                                    <Plus className="w-3 h-3" /> + Add Media Cards
                                                  </button>
                                                  <button
                                                    onClick={() => openAddPackageItemModal(item.id)}
                                                    className="px-2.5 py-1 rounded-lg border border-sky-500 text-sky-400 hover:bg-sky-500/10 text-xs font-bold flex items-center gap-1"
                                                  >
                                                    <Plus className="w-3 h-3" /> + Custom Item
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      ) : (
                                        packageItems.map((subItem) => {
                                          const subMeta = getCategoryMeta(subItem.category);
                                          return (
                                            <tr
                                              key={subItem.id}
                                              className={isLight ? 'hover:bg-sky-50/60' : 'hover:bg-slate-850/70'}
                                            >
                                              {/* Sub Department */}
                                              <td className="p-2 align-middle">
                                                {isEditable ? (
                                                  <select
                                                    value={subItem.category}
                                                    onChange={(e) =>
                                                      updatePackageItem(item.id, subItem.id, {
                                                        category: e.target.value as EquipmentCategory,
                                                      })
                                                    }
                                                    className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer ${subMeta.badgeBg} ${subMeta.badgeText}`}
                                                  >
                                                    {EQUIPMENT_CATEGORIES.map((c) => (
                                                      <option key={c.key} value={c.key}>
                                                        {c.shortLabel}
                                                      </option>
                                                    ))}
                                                  </select>
                                                ) : (
                                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${subMeta.badgeBg} ${subMeta.badgeText}`}>
                                                    {subMeta.shortLabel}
                                                  </span>
                                                )}
                                              </td>

                                              {/* Sub Name */}
                                              <td className="p-2 align-middle">
                                                {isEditable ? (
                                                  <input
                                                    type="text"
                                                    value={subItem.name}
                                                    onChange={(e) =>
                                                      updatePackageItem(item.id, subItem.id, { name: e.target.value })
                                                    }
                                                    className={`${inputClass} text-xs font-bold`}
                                                  />
                                                ) : (
                                                  <span className="text-xs font-bold">{subItem.name}</span>
                                                )}
                                              </td>

                                              {/* Sub Brand */}
                                              <td className="p-2 align-middle">
                                                {isEditable ? (
                                                  <input
                                                    type="text"
                                                    list={`brand-datalist-${subItem.category}`}
                                                    value={subItem.brand || ''}
                                                    onChange={(e) =>
                                                      updatePackageItem(item.id, subItem.id, { brand: e.target.value })
                                                    }
                                                    placeholder="Brand..."
                                                    className={`${inputClass} text-xs font-semibold`}
                                                  />
                                                ) : (
                                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{subItem.brand || '—'}</span>
                                                )}
                                              </td>

                                              {/* Sub Model */}
                                              <td className="p-2 align-middle">
                                                {isEditable ? (
                                                  <input
                                                    type="text"
                                                    value={subItem.model || ''}
                                                    onChange={(e) =>
                                                      updatePackageItem(item.id, subItem.id, { model: e.target.value })
                                                    }
                                                    placeholder="Model..."
                                                    className={`${inputClass} text-[11px] font-mono`}
                                                  />
                                                ) : (
                                                  <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400">{subItem.model || '—'}</span>
                                                )}
                                              </td>

                                              {/* Sub Quantity */}
                                              <td className="p-2 align-middle text-center">
                                                <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-black/5 dark:bg-black/40 overflow-hidden text-xs">
                                                  {isEditable && (
                                                    <button
                                                      onClick={() =>
                                                        updatePackageItem(item.id, subItem.id, {
                                                          quantity: Math.max(1, subItem.quantity - 1),
                                                        })
                                                      }
                                                      className="px-1.5 py-0.5 hover:bg-slate-500/20 font-mono font-bold"
                                                    >
                                                      -
                                                    </button>
                                                  )}
                                                  {isEditable ? (
                                                    <input
                                                      type="number"
                                                      min={1}
                                                      value={subItem.quantity}
                                                      onChange={(e) =>
                                                        updatePackageItem(item.id, subItem.id, {
                                                          quantity: Math.max(1, Number(e.target.value) || 1),
                                                        })
                                                      }
                                                      className="w-10 bg-transparent text-center font-mono font-bold py-0.5 focus:outline-hidden"
                                                    />
                                                  ) : (
                                                    <span className="px-2 py-0.5 font-mono font-bold text-center">
                                                      {subItem.quantity}
                                                    </span>
                                                  )}
                                                  {isEditable && (
                                                    <button
                                                      onClick={() =>
                                                        updatePackageItem(item.id, subItem.id, {
                                                          quantity: subItem.quantity + 1,
                                                        })
                                                      }
                                                      className="px-1.5 py-0.5 hover:bg-slate-500/20 font-mono font-bold"
                                                    >
                                                      +
                                                    </button>
                                                  )}
                                                </div>
                                              </td>

                                              {/* Sub Role */}
                                              <td className="p-2 align-middle">
                                                {isEditable ? (
                                                  <input
                                                    type="text"
                                                    value={subItem.roleOrFunction || ''}
                                                    onChange={(e) =>
                                                      updatePackageItem(item.id, subItem.id, { roleOrFunction: e.target.value })
                                                    }
                                                    placeholder="Role..."
                                                    className={`${inputClass} text-xs`}
                                                  />
                                                ) : (
                                                  <span className="text-xs text-slate-700 dark:text-slate-300">{subItem.roleOrFunction || '—'}</span>
                                                )}
                                              </td>

                                              {/* Sub Specs */}
                                              <td className="p-2 align-middle">
                                                {isEditable ? (
                                                  <input
                                                    type="text"
                                                    value={subItem.specs || ''}
                                                    onChange={(e) =>
                                                      updatePackageItem(item.id, subItem.id, { specs: e.target.value })
                                                    }
                                                    placeholder="Specs..."
                                                    className={`${inputClass} text-[11px]`}
                                                  />
                                                ) : (
                                                  <span className="text-[11px] text-slate-600 dark:text-slate-400">{subItem.specs || '—'}</span>
                                                )}
                                              </td>

                                              {/* Sub Actions */}
                                              {isEditable && (
                                                <td className="p-2 align-middle text-right pr-3">
                                                  <div className="inline-flex items-center gap-1">
                                                    <button
                                                      onClick={() =>
                                                        addPackageItem(item.id, {
                                                          ...subItem,
                                                          name: `${subItem.name} (Copy)`,
                                                        })
                                                      }
                                                      title="Duplicate accessory"
                                                      className="p-1 rounded hover:bg-emerald-500/15 hover:text-emerald-400 text-slate-400 transition-colors"
                                                    >
                                                      <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                      onClick={() => deletePackageItem(item.id, subItem.id)}
                                                      title="Remove from package"
                                                      className="p-1 rounded hover:bg-rose-500/15 hover:text-rose-400 text-slate-400 transition-colors"
                                                    >
                                                      <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                  </div>
                                                </td>
                                              )}
                                            </tr>
                                          );
                                        })
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Spreadsheet Table Footer Summary */}
            <div
              className={`p-2 border-t flex items-center justify-between text-[11px] font-mono font-bold ${
                isLight ? 'bg-slate-100/80 border-slate-200 text-slate-700' : 'bg-slate-950/80 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span>TOTAL ROWS: {filteredItems.length}</span>
                <span>•</span>
                <span>TOTAL GEAR & ACCESSORIES: {totalItemCount} UNITS</span>
              </div>
              {scope === 'current' && (
                <button
                  onClick={() => openAddModal()}
                  className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Row
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* DEPARTMENT RUBRIC CARDS VIEW                                             */
          /* ========================================================================= */
          <div className="flex flex-col gap-3">
            {EQUIPMENT_CATEGORIES.map((cat) => {
              const items = groupedItems.get(cat.key) || [];
              if (items.length === 0) return null;

              const rubricTotalQty = items.reduce((sum, item) => {
                const subSum = (item.packageItems || []).reduce((s, p) => s + p.quantity, 0);
                return sum + item.quantity + subSum;
              }, 0);

              return (
                <div key={cat.key} className={`border rounded-xl overflow-hidden shadow-xs ${cardBg}`}>
                  {/* Rubric Header */}
                  <div
                    className={`px-3 py-2 border-b flex items-center justify-between ${
                      isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`p-1 rounded-md ${cat.badgeBg} ${cat.badgeText}`}>
                        {getCategoryIcon(cat.key, 'w-3.5 h-3.5')}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider">{cat.label}</span>
                      <span className="text-[10px] font-mono opacity-60">
                        ({items.length} items · {rubricTotalQty} units)
                      </span>
                    </div>

                    {scope === 'current' && (
                      <button
                        onClick={() => openAddModal(cat.key)}
                        title={`Add item to ${cat.label}`}
                        className="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Rubric Items */}
                  <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
                    {items.map((item) => {
                      const isMaster = 'usedInSetups' in item;
                      const masterItem = isMaster ? (item as MasterEquipmentItem) : null;
                      const isPackage = item.isPackage || (item.packageItems && item.packageItems.length > 0) || item.name.includes('Package');
                      const isExpanded = !!expandedPackages[item.id];
                      const packageItems = item.packageItems || [];

                      return (
                        <div
                          key={item.id}
                          className={`p-2.5 flex flex-col gap-2 transition-colors ${rowBg}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {isPackage && (
                                  <button
                                    onClick={() => togglePackageExpand(item.id)}
                                    className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                      isExpanded
                                        ? 'bg-sky-600 text-white'
                                        : 'bg-sky-500/15 text-sky-400'
                                    }`}
                                  >
                                    <Package className="w-3 h-3" />
                                    <span>{isExpanded ? 'Close Kit' : 'Open Kit'}</span>
                                    <span className="font-mono text-[10px] opacity-80">({packageItems.length})</span>
                                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                  </button>
                                )}

                                {isPackage && scope === 'current' && (
                                  <button
                                    onClick={() => openAddPackageItemModal(item.id)}
                                    className="px-2 py-1 rounded-lg bg-emerald-600/15 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 text-emerald-400 text-[11px] font-bold flex items-center gap-0.5"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Add Gear to Kit</span>
                                  </button>
                                )}

                                <span className="text-xs font-bold leading-tight">{item.name}</span>
                                {item.isCustom ? (
                                  <span className="px-1 py-0.2 rounded text-[8px] font-mono font-bold bg-violet-500/15 text-violet-400 border border-violet-500/30">
                                    Custom
                                  </span>
                                ) : (
                                  <span className="px-1 py-0.2 rounded text-[8px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                    Canvas
                                  </span>
                                )}
                                {item.roleOrFunction && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-500/15 text-slate-400">
                                    {item.roleOrFunction}
                                  </span>
                                )}
                              </div>

                              {/* Brand & Model */}
                              {(item.brand || item.model) && (
                                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                                  {item.brand && <span className="font-semibold">{item.brand}</span>}
                                  {item.brand && item.model && <span>·</span>}
                                  {item.model && <span>{item.model}</span>}
                                </div>
                              )}

                              {/* Technical Specs */}
                              {item.specs && (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                  {item.specs}
                                </div>
                              )}

                              {/* Master Scene Usage Tags */}
                              {masterItem && (
                                <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                                  <span className="text-[9px] font-mono uppercase font-bold opacity-60">Used In:</span>
                                  {masterItem.usedInSetups.map((s, sIdx) => (
                                    <span
                                      key={sIdx}
                                      className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-violet-500/15 text-violet-300 border border-violet-500/20"
                                    >
                                      {s.sceneNumber ? `Sc ${s.sceneNumber}` : s.name} (×{s.quantity})
                                    </span>
                                  ))}
                                  <span className="text-[9px] font-mono opacity-60 ml-1">
                                    · Peak Concurrent: {masterItem.maxConcurrentQuantity}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Quantity & Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Quantity pill / Stepper */}
                              <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-black/5 dark:bg-black/40 overflow-hidden text-xs">
                                {scope === 'current' && (
                                  <button
                                    onClick={() =>
                                      updateEquipmentItem(item.id, {
                                        quantity: Math.max(1, item.quantity - 1),
                                      })
                                    }
                                    title="Decrease quantity"
                                    className="px-1.5 py-0.5 hover:bg-slate-500/20 transition-colors font-mono font-bold"
                                  >
                                    -
                                  </button>
                                )}
                                <span className="px-2 py-0.5 font-mono font-bold text-center min-w-[28px]">
                                  {item.quantity}
                                </span>
                                {scope === 'current' && (
                                  <button
                                    onClick={() =>
                                      updateEquipmentItem(item.id, {
                                        quantity: item.quantity + 1,
                                      })
                                    }
                                    title="Increase quantity"
                                    className="px-1.5 py-0.5 hover:bg-slate-500/20 transition-colors font-mono font-bold"
                                  >
                                    +
                                  </button>
                                )}
                              </div>

                              {/* Item Actions */}
                              {scope === 'current' && (
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={() => openEditModal(item)}
                                    title="Edit brand, model, name, or specs"
                                    className="p-1 rounded hover:bg-sky-500/15 hover:text-sky-400 transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      addCustomEquipmentItem({
                                        category: item.category,
                                        name: `${item.name} (Copy)`,
                                        brand: item.brand,
                                        model: item.model,
                                        quantity: item.quantity,
                                        roleOrFunction: item.roleOrFunction,
                                        specs: item.specs,
                                        notes: item.notes,
                                        isPackage: item.isPackage,
                                        packageItems: item.packageItems ? JSON.parse(JSON.stringify(item.packageItems)) : undefined,
                                      })
                                    }
                                    title="Duplicate item"
                                    className="p-1 rounded hover:bg-emerald-500/15 hover:text-emerald-400 transition-colors"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteEquipmentItem(item.id)}
                                    title="Delete item"
                                    className="p-1 rounded hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Nested Package Items in Card View */}
                          {isPackage && isExpanded && (
                            <div className="mt-1 pl-3 border-l-2 border-sky-500/60 flex flex-col gap-1.5 bg-black/5 dark:bg-black/20 p-2 rounded-r-lg">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 font-mono">
                                  Package Kit Components ({packageItems.length})
                                </span>
                                {scope === 'current' && (
                                  <button
                                    onClick={() => openAddPackageItemModal(item.id)}
                                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold flex items-center gap-0.5"
                                  >
                                    <Plus className="w-2.5 h-2.5" /> + Add Gear
                                  </button>
                                )}
                              </div>

                              <div className="space-y-1">
                                {packageItems.map((sub) => (
                                  <div
                                    key={sub.id}
                                    className="flex items-center justify-between text-[11px] bg-white/40 dark:bg-slate-900/40 px-2 py-1 rounded"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-sky-600">x{sub.quantity}</span>
                                      <span className="font-bold">{sub.name}</span>
                                      {sub.brand && <span className="opacity-60">· {sub.brand}</span>}
                                    </div>
                                    {scope === 'current' && (
                                      <button
                                        onClick={() => deletePackageItem(item.id, sub.id)}
                                        className="text-slate-400 hover:text-rose-400 p-0.5"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Add / Edit General Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div
            className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${
              isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-sky-500/15 text-sky-400">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    {editingItem ? 'Edit Production Equipment' : 'Add Production Equipment'}
                  </h3>
                  <p className="text-[11px] opacity-60">
                    Scene {activeSetup.sceneNumber || '1'}: {activeSetup.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="mt-4 flex flex-col gap-3.5">
              {/* Optional: Target Package Selector */}
              {!editingItem && availableCameraPackages.length > 0 && (
                <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-sky-400 mb-1">
                    📦 Destination Package (Optional)
                  </label>
                  <select
                    value={formData.targetPackageId || ''}
                    onChange={(e) => setFormData({ ...formData, targetPackageId: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border font-semibold ${
                      isLight ? 'bg-white border-sky-300 text-slate-900' : 'bg-slate-800 border-sky-700 text-slate-100'
                    }`}
                  >
                    <option value="">-- Standalone Item (Not in package) --</option>
                    {availableCameraPackages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        Attach directly inside {pkg.name} (Camera Kit)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Category Rubric */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                  Department / Category Rubric
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => {
                    const newCat = e.target.value as EquipmentCategory;
                    const brands = getBrandsForCategory(newCat);
                    const defaultBrand = brands[0] || '';
                    const defaultModel = getModelsForBrand(newCat, defaultBrand)[0] || '';
                    setFormData({
                      ...formData,
                      category: newCat,
                      brand: defaultBrand,
                      model: defaultModel,
                      name: defaultModel || formData.name,
                    });
                  }}
                  className={`w-full p-2 text-xs rounded-lg border font-semibold ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                >
                  {EQUIPMENT_CATEGORIES.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Brand & Model Templates Selector */}
              <div className="grid grid-cols-2 gap-2 bg-slate-500/5 p-2.5 rounded-xl border border-slate-500/20">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                      Brand Template
                    </label>
                    <span className="text-[9px] opacity-60">Dropdown</span>
                  </div>
                  <select
                    value={formData.brand}
                    onChange={(e) => {
                      const newBrand = e.target.value;
                      const models = getModelsForBrand(formData.category, newBrand);
                      const firstModel = models[0] || '';
                      setFormData({
                        ...formData,
                        brand: newBrand,
                        model: firstModel,
                        name: firstModel || formData.name,
                      });
                    }}
                    className={`w-full p-1.5 text-xs rounded-lg border font-semibold ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  >
                    <option value="">-- Custom Brand --</option>
                    {getBrandsForCategory(formData.category).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                      Model Template
                    </label>
                    <span className="text-[9px] opacity-60">Dropdown</span>
                  </div>
                  <select
                    value={formData.model}
                    onChange={(e) => {
                      const newModel = e.target.value;
                      setFormData({
                        ...formData,
                        model: newModel,
                        name: newModel || formData.name,
                      });
                    }}
                    className={`w-full p-1.5 text-xs rounded-lg border font-mono text-[11px] ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  >
                    <option value="">-- Custom Model --</option>
                    {getModelsForBrand(formData.category, formData.brand).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Item Name & Quantity */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                    Item Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Camera A Package, ARRI SkyPanel S60-C, Sony FX6"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border focus:ring-1 focus:ring-sky-500 font-bold ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, quantity: Math.max(1, Number(e.target.value)) })
                    }
                    className={`w-full p-2 text-xs rounded-lg border font-mono font-bold text-center focus:ring-1 focus:ring-sky-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Freehand Brand & Model Customization */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                    Brand / Manufacturer
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ARRI, Aputure, Nanlite"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border focus:ring-1 focus:ring-sky-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                    Model / Variant
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SkyPanel S60-C, LS 600d Pro"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border focus:ring-1 focus:ring-sky-500 font-mono text-[11px] ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Role / Function */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                  Production Role / Function
                </label>
                <input
                  type="text"
                  placeholder="e.g. Key Light, Backlight / Rim, A-Cam Main, Overhead Boom"
                  value={formData.roleOrFunction}
                  onChange={(e) => setFormData({ ...formData, roleOrFunction: e.target.value })}
                  className={`w-full p-2 text-xs rounded-lg border focus:ring-1 focus:ring-sky-500 ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              {/* Technical Specs & Notes */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                  Technical Specs & Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. 5600K · 100% · Barn Doors, V-Lock mount, 12G 4K60p rated"
                  value={formData.specs}
                  onChange={(e) => setFormData({ ...formData, specs: e.target.value })}
                  className={`w-full p-2 text-xs rounded-lg border focus:ring-1 focus:ring-sky-500 custom-scrollbar ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-md flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingItem ? 'Save Changes' : formData.targetPackageId ? 'Attach to Package' : 'Add Item'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. DEDICATED ADD ITEM TO CAMERA PACKAGE MODAL */}
      {isAddPackageItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
              isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    Add Gear to Camera Package
                  </h3>
                  <p className="text-[11px] opacity-60">
                    Attach batteries, media cards, monitor, transmitter, or accessories
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddPackageItemModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePackageItemModal} className="mt-4 flex flex-col gap-3">
              {/* Preset Quick Loader */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-emerald-500">
                  ⚡ Choose Preset (Or type custom below)
                </label>
                <select
                  onChange={(e) => {
                    const preset = CAMERA_PACKAGE_PRESETS.find((p) => p.name === e.target.value);
                    if (preset) {
                      setPackageFormData({
                        category: preset.category,
                        name: preset.name,
                        brand: preset.brand,
                        model: preset.model,
                        quantity: preset.quantity,
                        roleOrFunction: preset.roleOrFunction,
                        specs: preset.specs,
                      });
                    }
                  }}
                  className={`w-full p-2 text-xs rounded-lg border font-semibold ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                >
                  <option value="">-- Select Camera Accessory Preset --</option>
                  {CAMERA_PACKAGE_PRESETS.map((p, idx) => (
                    <option key={idx} value={p.name}>
                      {p.name} (x{p.quantity}) - {p.brand}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                  Category Rubric
                </label>
                <select
                  value={packageFormData.category}
                  onChange={(e) =>
                    setPackageFormData({ ...packageFormData, category: e.target.value as EquipmentCategory })
                  }
                  className={`w-full p-2 text-xs rounded-lg border font-semibold ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                >
                  {EQUIPMENT_CATEGORIES.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Item Name & Quantity */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                    Accessory Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. V-Mount Batteries, CFexpress Type B"
                    value={packageFormData.name}
                    onChange={(e) => setPackageFormData({ ...packageFormData, name: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border font-bold ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={packageFormData.quantity}
                    onChange={(e) =>
                      setPackageFormData({ ...packageFormData, quantity: Math.max(1, Number(e.target.value)) })
                    }
                    className={`w-full p-2 text-xs rounded-lg border font-mono font-bold text-center ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Brand & Model */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                    Brand
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Anton Bauer, SanDisk, SmallHD"
                    value={packageFormData.brand}
                    onChange={(e) => setPackageFormData({ ...packageFormData, brand: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                    Model / Variant
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Titon 150, Cine 7"
                    value={packageFormData.model}
                    onChange={(e) => setPackageFormData({ ...packageFormData, model: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border font-mono text-[11px] ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Role & Specs */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                  Role / Function
                </label>
                <input
                  type="text"
                  placeholder="e.g. Camera Power, Recording Media, Focus Peaking"
                  value={packageFormData.roleOrFunction}
                  onChange={(e) => setPackageFormData({ ...packageFormData, roleOrFunction: e.target.value })}
                  className={`w-full p-2 text-xs rounded-lg border ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-75">
                  Technical Specs
                </label>
                <input
                  type="text"
                  placeholder="e.g. 14.4V High-Draw · 150Wh · USB-C"
                  value={packageFormData.specs}
                  onChange={(e) => setPackageFormData({ ...packageFormData, specs: e.target.value })}
                  className={`w-full p-2 text-xs rounded-lg border ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddPackageItemModalOpen(false)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md flex items-center gap-1 font-bold"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Attach to Package</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
