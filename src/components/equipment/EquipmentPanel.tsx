import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Crosshair,
  Edit2,
  FileSpreadsheet,
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
  Workflow,
  Zap,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';
import { useFixtureCatalog } from '../inspector/useFixtureCatalog';
import { waitForImages } from '../../utils/image';
import { CameraElement, EquipmentCategory, EquipmentItem, LightElement, MasterEquipmentItem } from '../../types';
import {
  CAMERA_PACKAGE_PRESETS,
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
import { computePowerSummary } from '../../utils/powerPlanning';
import { autoPatchFixtures, collectFixturePatches, findConflicts, sortedPatchRows } from '../../utils/dmxPatch';
import { DmxPatchPrintView } from '../reports/DmxPatchPrintView';
import { DmxUniverseView } from './DmxUniverseView';
import { SignalFlowView } from './SignalFlowView';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import {
  fixtureModeLabel,
  fixtureProfileLinkUpdates,
  fixtureSpecsLine,
  gearProfileUpdates,
  mergeGearBrands,
  mergeGearModels,
} from '../../domain/fixtures';
import type { FixtureProfile, GearBrandOption, GearModelOption } from '../../domain/fixtures';

/**
 * Only the lighting department has a real-fixture database behind it. Every
 * other category gets an empty profile list, which makes the merge helpers
 * fall through to the curated department names unchanged.
 */
const usesFixtureDatabase = (category: EquipmentCategory): boolean => category === 'lighting';

/** `<optgroup>`s separating the curated department names from database entries. */
const BrandOptions: React.FC<{ options: GearBrandOption[] }> = ({ options }) => {
  const department = options.filter((option) => option.fromDepartment);
  const database = options.filter((option) => !option.fromDepartment);
  const optionClass = 'bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold';
  const label = (option: GearBrandOption) =>
    option.profileCount > 0 ? `${option.brand} (${option.profileCount})` : option.brand;
  if (database.length === 0) {
    return (
      <>
        {department.map((option) => (
          <option key={option.brand} value={option.brand} className={optionClass}>
            {label(option)}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      <optgroup label="Department catalog">
        {department.map((option) => (
          <option key={option.brand} value={option.brand} className={optionClass}>
            {label(option)}
          </option>
        ))}
      </optgroup>
      <optgroup label={`Fixture database (${database.length} makers)`}>
        {database.map((option) => (
          <option key={option.brand} value={option.brand} className={optionClass}>
            {label(option)}
          </option>
        ))}
      </optgroup>
    </>
  );
};

/** Model options, marking the ones that carry database data with a ◆. */
const ModelOptions: React.FC<{ options: GearModelOption[] }> = ({ options }) => {
  const optionClass = 'bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold';
  const linked = options.filter((option) => option.profile);
  const plain = options.filter((option) => !option.profile);
  if (linked.length === 0) {
    return (
      <>
        {plain.map((option) => (
          <option key={option.model} value={option.model} className={optionClass}>
            {option.model}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      <optgroup label="Fixture database — DMX & specs included">
        {linked.map((option) => (
          <option key={option.model} value={option.model} className={optionClass}>
            ◆ {option.model}
            {option.profile!.modes.length > 0 ? ` — ${option.profile!.modes.length} DMX mode${option.profile!.modes.length === 1 ? '' : 's'}` : ''}
          </option>
        ))}
      </optgroup>
      {plain.length > 0 && (
        <optgroup label="Department catalog — name only">
          {plain.map((option) => (
            <option key={option.model} value={option.model} className={optionClass}>
              {option.model}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
};

export const EquipmentPanel: React.FC = () => {
  // Prefix for pairing each caption with its control (`htmlFor`/`id`). From
  // `useId` so two instances of this panel on screen cannot collide — the
  // captions used to be plain siblings with no `htmlFor`, which meant screen
  // readers announced every one of these inputs unlabelled.
  const fieldId = useId();
  const { activeSetup, project, addCustomEquipmentItem, updateEquipmentItem, deleteEquipmentItem, resetSceneEquipment, addPackageItem, updatePackageItem, deletePackageItem, updateElement, quickAddElement, selectElement, selectedElementIds, setHighlightedElement } = useFloorPlan();
  const { openExportModal, theme } = useWorkspaceUI();
  // Re-render when the fixture catalog changes: the bundled snapshot arrives
  // asynchronously and an online refresh can replace it, and both change the
  // wattage and specs derived below — and the brand / model options offered
  // for lighting rows.
  const fixtureCatalog = useFixtureCatalog();
  const fixtureProfiles = fixtureCatalog.profiles;

  /** Brands offered for a department: curated names plus database makers. */
  const brandOptionsFor = (category: EquipmentCategory): GearBrandOption[] =>
    mergeGearBrands(getBrandsForCategory(category), usesFixtureDatabase(category) ? fixtureProfiles : []);

  /** Models offered for a brand, with database profiles attached where they exist. */
  const modelOptionsFor = (category: EquipmentCategory, brand: string | undefined): GearModelOption[] =>
    mergeGearModels(
      getModelsForBrand(category, brand || ''),
      usesFixtureDatabase(category) ? fixtureProfiles : [],
      brand,
    );

  const profileById = (id: string | undefined): FixtureProfile | undefined =>
    id ? fixtureProfiles.find((profile) => profile.id === id) : undefined;

  /**
   * Whether the specs field may be overwritten when a new database model is
   * chosen. Anything the user typed themselves is left alone; only an empty
   * field or a line this code generated for the previous profile is replaced.
   */
  /**
   * Push a fixture-database link onto the plan element a gear row stands for.
   *
   * The DMX patch bay addresses canvas fixtures — it reads `dmxChannelCount`
   * off the light element, not off the equipment row. So a footprint recorded
   * only on the row is a footprint the patch bay cannot see, which is exactly
   * what "nothing to patch" meant: the gear list knew the fixture was an
   * ARRI L7 with a 20-channel personality and the light on the plan did not.
   * Both halves describe one physical fixture, so both get the link.
   */
  const syncFixtureLinkToElement = (
    item: EquipmentItem,
    profile: FixtureProfile | undefined,
    modeId: string | undefined,
  ) => {
    const elementId = resolveItemElementId(item);
    if (!elementId) return;
    const element = activeSetup.elements.find((candidate) => candidate.id === elementId);
    if (!element || element.type !== 'light') return;
    updateElement(
      elementId,
      profile
        ? fixtureProfileLinkUpdates(profile, modeId)
        : { fixtureProfileId: undefined, fixtureModeId: undefined, dmxModeName: undefined, dmxChannelCount: undefined },
    );
  };

  /**
   * Put a gear-list fixture that is not on the plan onto it, carrying its
   * database link. An off-plan row cannot be patched at all — the patch bay
   * has no element to address — so this is the step that makes one patchable
   * rather than a silent no-op.
   */
  const placeFixtureOnPlan = (item: EquipmentItem, profile: FixtureProfile) => {
    const link = fixtureProfileLinkUpdates(profile, item.fixtureModeId);
    const elementId = quickAddElement({
      type: 'light',
      fixtureType: 'led_panel',
      name: item.name,
      ...link,
    });
    updateEquipmentItem(item.id, { elementId });
    selectElement(elementId);
  };

  const specsIsDerived = (specs: string | undefined, previousProfileId: string | undefined, previousModeId: string | undefined): boolean => {
    if (!specs || !specs.trim()) return true;
    const previous = profileById(previousProfileId);
    return previous ? specs.trim() === fixtureSpecsLine(previous, previousModeId) : false;
  };

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
    /** Set when the chosen model came from the fixture database (plan §17). */
    fixtureProfileId?: string;
    fixtureModeId?: string;
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

  const powerSummary = useMemo(() => computePowerSummary(activeSetup.elements || []), [activeSetup.elements]);

  // DMX patch summary for floor-plan light fixtures
  const fixtureElements = useMemo(
    () => (activeSetup.elements || []).filter((e): e is LightElement => e.type === 'light'),
    [activeSetup.elements]
  );
  const dmxPatches = useMemo(() => findConflicts(collectFixturePatches(fixtureElements)), [fixtureElements]);
  const dmxableCount = dmxPatches.filter((p) => p.dmxable).length;
  const dmxPatchedCount = dmxPatches.filter((p) => p.dmxable && p.universe && p.address).length;
  const dmxConflictCount = dmxPatches.filter((p) => p.dmxable && p.conflict).length;
  const [dmxPatchStart, setDmxPatchStart] = useState({ universe: 1, address: 1 });
  const [dmxPatchOpen, setDmxPatchOpen] = useState(false);
  const [isUniverseViewOpen, setIsUniverseViewOpen] = useState(false);
  const [isSignalFlowOpen, setIsSignalFlowOpen] = useState(false);
  /** When true, the printable DMX patch sheet is mounted and printing starts. */
  const [dmxPrintOpen, setDmxPrintOpen] = useState(false);
  // Both gear modals are overlays rather than real <dialog>s, so they need their
  // own focus trap to stay reachable by keyboard and to hand focus back on close.
  const addModalRef = useDialogFocusTrap(isAddModalOpen);
  const addPackageItemModalRef = useDialogFocusTrap(isAddPackageItemModalOpen);
  const dmxSheetRows = useMemo(() => sortedPatchRows(dmxPatches), [dmxPatches]);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  // --- Gear list <-> floor-plan selection sync -------------------------------
  /** Resolve the canvas element a gear row points at (lights, props, tracks,
   *  cables link directly; camera packages resolve via their letter). */
  const resolveItemElementId = (item: EquipmentItem): string | null => {
    const id = item.elementId;
    if (!id) return null;
    if (activeSetup.elements.some((el) => el.id === id)) return id;
    if (id.startsWith('cam-letter-')) {
      const letter = id.slice('cam-letter-'.length).toUpperCase();
      const cam = activeSetup.elements.find(
        (el): el is CameraElement =>
          el.type === 'camera' && (el as CameraElement).cameraLabel?.toUpperCase() === letter
      );
      if (cam) return cam.id;
    }
    return null;
  };

  /** Selecting a gear row also selects its fixture on the floor plan — with
   *  the same amber flash a shot-list camera selection produces. */
  const locateGearOnPlan = (item: EquipmentItem) => {
    const elementId = resolveItemElementId(item);
    if (!elementId) return;
    selectElement(elementId);
    setHighlightedElement(elementId);
    window.setTimeout(() => setHighlightedElement(null), 1500);
  };

  /** Clicking a gear row selects its element on the floor plan (the reverse of
   *  canvas -> gear-list highlighting). Controls inside the row keep their own
   *  behavior; double-click still opens the full editor on top of it. */
  const handleGearRowClick = (
    event: React.MouseEvent,
    item: EquipmentItem | MasterEquipmentItem
  ) => {
    if (!resolveItemElementId(item)) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, label')) return;
    locateGearOnPlan(item);
  };

  // Mount the hidden patch sheet, let the browser paint it, print, unmount.
  useEffect(() => {
    if (!dmxPrintOpen) return;
    const unmount = () => setDmxPrintOpen(false);
    window.addEventListener('afterprint', unmount);
    let cancelled = false;
    const printTimer = window.setTimeout(() => {
      void waitForImages(document.body).then(() => {
        if (!cancelled) window.print();
      });
    }, 50);
    const fallbackTimer = window.setTimeout(unmount, 15000);
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', unmount);
      window.clearTimeout(printTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [dmxPrintOpen]);

  const handleAutoPatch = () => {
    const assigned = autoPatchFixtures(
      collectFixturePatches(fixtureElements),
      dmxPatchStart.universe,
      dmxPatchStart.address
    );
    fixtureElements.forEach((light, i) => {
      updateElement(light.id, {
        dmxUniverse: assigned[i].universe,
        dmxAddress: assigned[i].address,
      });
    });
  };

  const handleClearDmx = () => {
    fixtureElements.forEach((light) => {
      updateElement(light.id, { dmxUniverse: undefined, dmxAddress: undefined });
    });
  };

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

  /** Canvas selection highlights (and scrolls to) the matching gear rows. */
  const highlightedItemIds = useMemo(() => {
    if (selectedElementIds.length === 0 || scope !== 'current') return new Set<string>();
    const ids = new Set<string>();
    for (const item of filteredItems) {
      const elementId = resolveItemElementId(item);
      if (elementId && selectedElementIds.includes(elementId)) ids.add(item.id);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems, selectedElementIds, activeSetup.elements]);

  useEffect(() => {
    const first = [...highlightedItemIds][0];
    if (!first) return;
    tableWrapRef.current
      ?.querySelector(`[data-elem-id="${CSS.escape(first)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightedItemIds]);

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
    const defaultOption = modelOptionsFor(cat, defaultBrand)[0];
    const linked = defaultOption && defaultOption.profile ? gearProfileUpdates(defaultOption.profile) : undefined;

    setEditingItem(null);
    setFormData({
      category: cat,
      name: (defaultOption && defaultOption.model) || '',
      brand: defaultBrand,
      model: (defaultOption && defaultOption.model) || '',
      quantity: 1,
      roleOrFunction: '',
      specs: linked?.specs ?? '',
      notes: '',
      targetPackageId: '',
      fixtureProfileId: linked?.fixtureProfileId,
      fixtureModeId: linked?.fixtureModeId,
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
      fixtureProfileId: item.fixtureProfileId,
      fixtureModeId: item.fixtureModeId,
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
        fixtureProfileId: formData.fixtureProfileId,
        fixtureModeId: formData.fixtureModeId,
      });
      // Keep the fixture on the plan in step with the row, so the DMX patch
      // bay sees the footprint chosen here.
      syncFixtureLinkToElement(editingItem, profileById(formData.fixtureProfileId), formData.fixtureModeId);
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
        fixtureProfileId: formData.fixtureProfileId,
        fixtureModeId: formData.fixtureModeId,
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

  const cardBg = isLight ? 'bg-white border-slate-300 text-slate-950 shadow-xs' : 'bg-slate-900 border-slate-800 text-slate-100';
  const rowBg = isLight ? 'bg-white hover:bg-slate-50/90 border-b border-slate-200 text-slate-950' : 'bg-slate-950/60 border-b border-slate-800/80 hover:bg-slate-800/50 text-slate-100';
  const inputClass = isLight
    ? 'w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-950 font-bold placeholder:text-slate-400 border border-slate-300/80 hover:border-sky-500 focus:border-sky-600 rounded px-1.5 py-1 text-xs focus:outline-hidden transition-all shadow-2xs'
    : 'w-full bg-transparent focus:bg-slate-800 rounded px-1.5 py-1 border border-transparent hover:border-slate-700 focus:border-sky-500 focus:outline-hidden transition-all text-slate-100 font-bold placeholder:text-slate-500 text-xs';

  return (
    <div className={`h-full flex flex-col min-h-0 ${isLight ? 'bg-slate-100 text-slate-950' : 'bg-slate-900 text-slate-100'}`}>
      {/* 1. Header Toolbar */}
      <div className={`p-2.5 border-b flex flex-col gap-2 ${isLight ? 'border-slate-300 bg-white text-slate-950 shadow-2xs' : 'border-slate-800 bg-slate-950/40 text-slate-100'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isLight ? 'bg-sky-100 text-sky-800' : 'bg-sky-500/10 text-sky-500'}`}>
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-slate-950 dark:text-slate-100">
                <span>Equipment Manifest</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${isLight ? 'bg-sky-100 text-sky-900 border border-sky-300' : 'bg-sky-500/15 text-sky-400'}`}>
                  {totalItemCount} total units · {totalUniqueCount} gear items
                </span>
              </h2>
              <p className={`text-[10px] font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                {scope === 'current'
                  ? `Scene ${activeSetup.sceneNumber || '1'} (${activeSetup.name}) — Camera packages are expandable kits`
                  : `Master production truck package across all ${project.setups?.length || 1} scenes`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* View Mode Toggle: Spreadsheet (Default) vs Cards */}
            <div className={`flex items-center rounded-lg border p-0.5 text-[11px] font-bold ${isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-700 bg-slate-950'}`}>
              <button
                onClick={() => setViewStyle('spreadsheet')}
                title="Spreadsheet Data Grid view (Default)"
                aria-pressed={viewStyle === 'spreadsheet'}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                  viewStyle === 'spreadsheet'
                    ? 'bg-sky-600 text-white shadow-xs font-black'
                    : isLight
                      ? 'text-slate-800 hover:text-black hover:bg-slate-200'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Spreadsheet</span>
              </button>
              <button
                onClick={() => setViewStyle('cards')}
                title="Department Rubric Cards view"
                aria-pressed={viewStyle === 'cards'}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                  viewStyle === 'cards'
                    ? 'bg-sky-600 text-white shadow-xs font-black'
                    : isLight
                      ? 'text-slate-800 hover:text-black hover:bg-slate-200'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>

            {/* Scope Selector: Current Scene vs All Scenes */}
            <div className={`flex items-center rounded-lg border p-0.5 text-[11px] font-bold ${isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-700 bg-slate-950'}`}>
              <button
                onClick={() => setScope('current')}
                aria-pressed={scope === 'current'}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                  scope === 'current'
                    ? 'bg-sky-600 text-white shadow-xs font-black'
                    : isLight
                      ? 'text-slate-800 hover:text-black hover:bg-slate-200'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Current Scene</span>
                <span className="text-[10px] font-mono opacity-90 font-black">({activeSetup.sceneNumber || '1'})</span>
              </button>
              <button
                onClick={() => setScope('all')}
                aria-pressed={scope === 'all'}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                  scope === 'all'
                    ? 'bg-violet-600 text-white shadow-xs font-black'
                    : isLight
                      ? 'text-slate-800 hover:text-black hover:bg-slate-200'
                      : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>All Scenes</span>
                <span className="text-[10px] font-mono opacity-90 font-black">({project.setups?.length || 1})</span>
              </button>
            </div>

            {/* DMX Universe View Toggle */}
            {scope === 'current' && (
              <button
                onClick={() => setIsUniverseViewOpen((v) => !v)}
                title="Visual 512-channel DMX universe map"
                aria-pressed={isUniverseViewOpen}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors ${
                  isUniverseViewOpen
                    ? 'bg-amber-500 text-white border-amber-400 shadow-xs'
                    : isLight
                      ? 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-900'
                      : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Universe View</span>
              </button>
            )}

            {/* Signal Flow View Toggle */}
            {scope === 'current' && (
              <button
                onClick={() => setIsSignalFlowOpen((v) => !v)}
                title="Layered signal path from sources to sinks"
                aria-pressed={isSignalFlowOpen}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors ${
                  isSignalFlowOpen
                    ? 'bg-emerald-500 text-white border-emerald-400 shadow-xs'
                    : isLight
                      ? 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-900'
                      : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <Workflow className="w-3.5 h-3.5" />
                <span>Signal Flow</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Controls & Fast Add */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[150px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-70 pointer-events-none text-slate-700 dark:text-slate-300" />
            <input
              type="text"
              placeholder="Search gear, brand, model, package, batteries, cards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-8 pr-7 py-1 text-xs rounded-lg border font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500 ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-950 placeholder:text-slate-500' : 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                title="Clear the equipment search"
                aria-label="Clear the equipment search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Presets Toggle */}
          <button
            onClick={() => setIsPresetDrawerOpen((prev) => !prev)}
            title="Fast-add common production gear (Batteries, SD cards, Cables, Tape, Clamps)"
            aria-pressed={isPresetDrawerOpen}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors ${
              isPresetDrawerOpen
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                : isLight
                  ? 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-900'
                  : 'border-slate-700 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Fast Add</span>
            {isPresetDrawerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Add Custom Gear Button */}
          {scope === 'current' && (
            <button
              onClick={() => openAddModal()}
              title="Add custom production item"
              className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-black flex items-center gap-1 shadow-xs"
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
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1 shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV Export</span>
          </button>

          {/* Export / Print Gear Manifest */}
          <button
            onClick={() => openExportModal('equipment')}
            title="Export / print the equipment package manifest"
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${
              isLight ? 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-900' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
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
              aria-label="Reset scene equipment to floor plan canvas defaults"
              className="p-1 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 2. Fast Add Presets Drawer */}
        {isPresetDrawerOpen && (
          <div
            className={`p-3 rounded-xl border flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 shadow-sm ${
              isLight ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-amber-950/30 border-amber-900/60 text-amber-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-black uppercase tracking-wider text-amber-950 dark:text-amber-200">
                  Fast-Add Production Presets
                </span>
              </div>
              <span className="text-[11px] font-semibold opacity-80">Click any preset to add it to Scene {activeSetup.sceneNumber || '1'}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto custom-scrollbar pr-0.5">
              {QUICK_EQUIPMENT_PRESETS.map((preset, idx) => {
                const meta = getCategoryMeta(preset.category);
                return (
                  <button
                    key={idx}
                    onClick={() => handleAddPreset(preset)}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all group ${
                      isLight
                        ? 'bg-white border-amber-300 hover:border-amber-600 hover:bg-amber-100/50 hover:shadow-xs text-slate-950'
                        : 'bg-slate-900 border-amber-800/50 hover:border-amber-500 hover:bg-slate-850 text-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-black truncate group-hover:text-amber-700 dark:group-hover:text-amber-400 text-slate-950 dark:text-slate-100">
                        {preset.name}
                      </span>
                      <span className="font-mono text-[10px] font-black text-amber-800 dark:text-amber-400 flex-shrink-0">
                        ×{preset.quantity}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-700 dark:text-slate-400">
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
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 pt-0.5">
          <button
            onClick={() => setSelectedCategory('all')}
            aria-pressed={selectedCategory === 'all'}
            className={`px-2.5 py-1 rounded-full text-[11px] font-black whitespace-nowrap transition-colors flex items-center gap-1 ${
              selectedCategory === 'all'
                ? isLight
                  ? 'bg-slate-950 text-white shadow-xs'
                  : 'bg-white text-slate-950 shadow-xs'
                : isLight
                  ? 'bg-slate-200 text-slate-900 hover:bg-slate-300'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <span>All Departments</span>
            <span className="font-mono text-[10px] opacity-80">({totalItemCount})</span>
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
                aria-pressed={selectedCategory === cat.key}
                className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all flex items-center gap-1.5 border shadow-2xs ${
                  selectedCategory === cat.key
                    ? `${cat.badgeBg} ${cat.badgeText} ${cat.borderColor} ring-2 ring-sky-500 shadow-sm`
                    : isLight
                      ? 'bg-white text-slate-950 border-slate-300 hover:border-slate-400 hover:bg-slate-100'
                      : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                }`}
                style={
                  selectedCategory === cat.key && isLight
                    ? { backgroundColor: cat.accentColor, color: '#ffffff', borderColor: cat.accentColor }
                    : undefined
                }
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.accentColor }}
                />
                {getCategoryIcon(cat.key, 'w-3.5 h-3.5')}
                <span>{cat.shortLabel}</span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    selectedCategory === cat.key
                      ? 'bg-black/20 text-white'
                      : isLight
                        ? 'bg-slate-200 text-slate-950'
                        : 'bg-slate-700 text-slate-200'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 4. Interactive Editing Hint Banner */}
        <div
          className={`px-3 py-1.5 rounded-lg border flex items-center justify-between gap-2 text-xs font-semibold ${
            scope === 'current'
              ? isLight
                ? 'bg-sky-50 border-sky-300 text-sky-950'
                : 'bg-sky-950/40 border-sky-800 text-sky-100'
              : isLight
                ? 'bg-violet-50 border-violet-300 text-violet-950'
                : 'bg-violet-950/40 border-violet-800 text-violet-100'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Info className="w-4 h-4 flex-shrink-0 text-sky-600 dark:text-sky-400" />
            <span>
              {scope === 'current'
                ? '📦 Click "Open Kit" or "+ Add Gear to Kit" on any camera package to attach batteries, memory cards, monitors, and accessories.'
                : '🔒 All Scenes master truck is a consolidated summary across the entire project.'}
            </span>
          </div>
          {scope === 'current' && (
            <span className="text-[10px] font-bold opacity-80 hidden sm:inline text-slate-700 dark:text-slate-300">
              Double-click row to open full editor
            </span>
          )}
        </div>

        {/* 4b. Cables & Power Load Summary (floor plan cable planner) */}
        {scope === 'current' && (powerSummary.poweredCablesCount > 0 || powerSummary.totalWatts > 0) && (
          <div
            className={`px-3 py-2.5 rounded-lg border flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs ${
              isLight ? 'bg-rose-50/70 border-rose-200 text-rose-950' : 'bg-rose-950/30 border-rose-800/50 text-rose-100'
            }`}
          >
            <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-[11px]">
              <Zap className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              Power Load
            </div>
            <span className="font-mono font-bold">
              {powerSummary.totalWatts.toLocaleString()} W total
            </span>
            <span className="opacity-80">
              🕹 {powerSummary.lightingWatts.toLocaleString()} W lights · 🎥 {powerSummary.cameraWatts.toLocaleString()} W cameras · 🎭 {powerSummary.propWatts.toLocaleString()} W set
            </span>
            <span className="flex items-center gap-1.5 ml-auto">
              <Cable className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
              <span className="font-mono font-bold">{powerSummary.poweredCablesCount} power run{powerSummary.poweredCablesCount === 1 ? '' : 's'}</span>
              <span className="opacity-80">· ~{powerSummary.estimatedCircuits20A} × 20A ckt · ~{powerSummary.recommendedSupplyKw} kW supply</span>
            </span>
          </div>
        )}

        {/* 4c. DMX Patch summary (floor plan light fixtures) */}
        {scope === 'current' && dmxableCount > 0 && (
          <div
            className={`rounded-lg border text-xs overflow-hidden ${
              isLight ? 'bg-amber-50/60 border-amber-200 text-amber-950' : 'bg-amber-950/25 border-amber-800/50 text-amber-100'
            }`}
          >
            <div className={`flex items-center border-b ${isLight ? 'border-amber-200' : 'border-amber-800/50'}`}>
              <button
                onClick={() => setDmxPatchOpen((v) => !v)}
                className="flex-1 min-w-0 px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-left"
                aria-expanded={dmxPatchOpen}
              >
              <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-[11px]">
                <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                DMX Patch
              </div>
              <span className="font-mono font-bold">
                {dmxPatchedCount}/{dmxableCount} patched
              </span>
              {dmxConflictCount > 0 ? (
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{dmxConflictCount} conflict{dmxConflictCount === 1 ? '' : 's'}</span>
              ) : (
                dmxPatchedCount > 0 && <span className="opacity-70">✓ no conflicts</span>
              )}
                <span className="ml-auto opacity-80">{dmxPatchOpen ? '▾' : '▸'} Patch</span>
              </button>
              <button
                onClick={() => setIsUniverseViewOpen(true)}
                title="Open the visual 512-channel DMX universe map"
                className={`shrink-0 mr-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-black flex items-center gap-1.5 transition-colors ${
                  isLight
                    ? 'border-amber-300 bg-white/80 text-amber-800 hover:bg-amber-100'
                    : 'border-amber-700/70 bg-amber-950/30 text-amber-200 hover:bg-amber-900/50'
                }`}
              >
                <Zap className="w-3.5 h-3.5" /> Universe View
              </button>
              <button
                onClick={() => setDmxPrintOpen(true)}
                disabled={dmxSheetRows.length === 0}
                title="Print the DMX patch sheet"
                aria-label="Print DMX patch sheet"
                className={`shrink-0 mr-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-black flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
                  isLight
                    ? 'border-slate-300 bg-white/80 text-slate-700 hover:bg-slate-100'
                    : 'border-slate-700 bg-slate-950/40 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>

            {dmxPatchOpen && (
              <div className="p-3 space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label htmlFor={`${fieldId}-start-universe`} className="opacity-60 block mb-1 text-[10px]">Start universe</label>
                    <input id={`${fieldId}-start-universe`}
                      type="number"
                      min={1}
                      value={dmxPatchStart.universe}
                      onChange={(e) => setDmxPatchStart((s) => ({ ...s, universe: Math.max(1, Math.floor(Number(e.target.value) || 1)) }))}
                      className={`w-16 border rounded px-1.5 py-1 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${fieldId}-start-address`} className="opacity-60 block mb-1 text-[10px]">Start address</label>
                    <input id={`${fieldId}-start-address`}
                      type="number"
                      min={1}
                      max={512}
                      value={dmxPatchStart.address}
                      onChange={(e) => setDmxPatchStart((s) => ({ ...s, address: Math.max(1, Math.min(512, Number(e.target.value) || 1)) }))}
                      className={`w-20 border rounded px-1.5 py-1 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                    />
                  </div>
                  <button
                    onClick={handleAutoPatch}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-black flex items-center gap-1 shadow-xs"
                  >
                    <Zap className="w-3.5 h-3.5" /> Auto-Patch
                  </button>
                  <button
                    onClick={handleClearDmx}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-black ${isLight ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                  >
                    Clear
                  </button>
                  <span className="text-[10px] opacity-60 ml-auto max-w-[180px] leading-snug">
                    Sequentially assigns every fixture based on its channel count.
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto custom-scrollbar rounded-lg border divide-y divide-slate-200 dark:divide-slate-800">
                  {dmxPatches.map((p) =>
                    !p.dmxable ? null : (
                      <button
                        key={p.light.id}
                        onClick={() => selectElement(p.light.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:opacity-80 ${
                          isLight ? 'bg-white/60' : 'bg-slate-950/40'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${p.universe && p.address ? (p.conflict ? 'bg-rose-500' : 'bg-emerald-500') : 'bg-slate-400'}`} />
                        <span className="truncate font-semibold flex-1">{p.label}</span>
                        <span className="opacity-50 font-mono text-[10px]">{p.channels}ch</span>
                        <span className={`font-mono font-bold ${p.conflict ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                          {p.universe && p.address ? `U${p.universe}:${String(p.address).padStart(3, '0')}` : '—'}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Equipment Main Content: Spreadsheet View (Default) vs Rubric Cards */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5">
        {filteredItems.length === 0 ? (
          <div className={`m-4 p-8 text-center border-2 border-dashed rounded-2xl ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'}`}>
            <Boxes className="w-12 h-12 mx-auto mb-2 opacity-40 text-sky-600 dark:text-sky-400" />
            <p className="text-sm font-black text-slate-950 dark:text-slate-100">No equipment found</p>
            <p className="text-xs opacity-80 mt-1 max-w-sm mx-auto text-slate-700 dark:text-slate-300">
              {searchQuery
                ? `No gear matching "${searchQuery}". Clear your search or add a custom item.`
                : 'Add cameras, lights, or props on the floor plan, or click “Add Gear” / “Fast Add” to attach batteries, cables, and production supplies.'}
            </p>
            {scope === 'current' && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => openAddModal()}
                  className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-black flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Add First Item
                </button>
                <button
                  onClick={() => setIsPresetDrawerOpen(true)}
                  className={`px-3.5 py-1.5 rounded-lg border text-xs font-black flex items-center gap-1 ${
                    isLight
                      ? 'border-amber-400 text-amber-900 bg-amber-50 hover:bg-amber-100'
                      : 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10'
                  }`}
                >
                  <Sparkles className="w-4 h-4" /> Fast Presets
                </button>
              </div>
            )}
          </div>
        ) : viewStyle === 'spreadsheet' ? (
          /* ========================================================================= */
          /* SPREADSHEET DATA GRID VIEW (WITH PROMINENT OPENABLE CAMERA PACKAGES)      */
          /* ========================================================================= */
          <div className={`border rounded-xl overflow-hidden shadow-xs ${cardBg}`}>
            <div ref={tableWrapRef} className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse font-sans">
                <thead>
                  <tr
                    className={`border-b text-[11px] font-mono uppercase font-black sticky top-0 z-10 ${
                      isLight ? 'bg-slate-200 text-slate-950 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-800'
                    }`}
                  >
                    <th className="p-2.5 w-28 whitespace-nowrap">DEPARTMENT</th>
                    <th className="p-2.5 min-w-[230px]">ITEM & PACKAGE NAME</th>
                    <th className="p-2.5 min-w-[140px]">BRAND</th>
                    <th className="p-2.5 min-w-[160px]">MODEL / VARIANT</th>
                    <th className="p-2.5 w-28 text-center">QTY</th>
                    <th className="p-2.5 min-w-[150px]">ROLE / FUNCTION</th>
                    <th className="p-2.5 min-w-[220px]">TECHNICAL SPECS & NOTES</th>
                    {scope === 'all' && (
                      <th className="p-2.5 min-w-[160px] font-mono text-[10px]">SCENE USAGE & PEAK</th>
                    )}
                    {scope === 'current' && <th className="p-2.5 w-28 text-right pr-3">ACTIONS</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredItems.map((item) => {
                    const meta = getCategoryMeta(item.category);
                    const isMaster = 'usedInSetups' in item;
                    const masterItem = isMaster ? (item as MasterEquipmentItem) : null;
                    const isEditable = scope === 'current';
                    const isPackage = item.isPackage || (item.packageItems && item.packageItems.length > 0) || item.name.includes('Package');
                    const isExpanded = !!expandedPackages[item.id];
                    const packageItems = item.packageItems || [];

                    // Brand + model options for this row: the department catalog
                    // merged with the fixture database for lighting (plan §17),
                    // plus whatever the row already holds so a hand-typed or
                    // canvas-derived value is never silently dropped from its
                    // own dropdown.
                    const rowBrandOptions = brandOptionsFor(item.category);
                    const brandSelectOptions =
                      item.brand && !rowBrandOptions.some((option) => option.brand === item.brand)
                        ? [{ brand: item.brand, fromDepartment: true, profileCount: 0 }, ...rowBrandOptions]
                        : rowBrandOptions;
                    const rowModelOptions = modelOptionsFor(item.category, item.brand);
                    const modelSelectOptions =
                      item.model && !rowModelOptions.some((option) => option.model === item.model)
                        ? [{ model: item.model }, ...rowModelOptions]
                        : rowModelOptions;
                    const rowProfile = profileById(item.fixtureProfileId);

                    return (
                      <React.Fragment key={item.id}>
                        {/* MAIN ITEM ROW */}
                        <tr
                          data-elem-id={resolveItemElementId(item) ?? undefined}
                          onClick={(e) => handleGearRowClick(e, item)}
                          onDoubleClick={() => {
                            if (isEditable) openEditModal(item);
                          }}
                          className={`transition-colors group cursor-pointer ${
                            highlightedItemIds.has(item.id)
                              ? isLight
                                ? '!bg-cyan-100 ring-2 ring-inset ring-cyan-500'
                                : '!bg-cyan-950/60 ring-2 ring-inset ring-cyan-400'
                              : isPackage
                              ? isExpanded
                                ? isLight
                                  ? 'bg-sky-100/70 border-b-2 border-sky-400 text-slate-950'
                                  : 'bg-sky-950/40 border-b-2 border-sky-800 text-slate-100'
                                : isLight
                                  ? 'bg-sky-50/50 hover:bg-sky-100/70 text-slate-950 border-b border-slate-200'
                                  : 'bg-sky-950/20 hover:bg-sky-950/40 text-slate-100 border-b border-slate-800'
                              : isLight
                                ? 'bg-white hover:bg-slate-50 border-b border-slate-200 text-slate-950'
                                : 'hover:bg-slate-850/50 odd:bg-slate-900 even:bg-slate-950/30 text-slate-100 border-b border-slate-800'
                          }`}
                        >
                          {/* 1. Department Selector / Badge */}
                          <td className="p-2.5 align-middle">
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
                                className={`text-[11px] font-black uppercase tracking-wide rounded-md px-2 py-1 border shadow-xs cursor-pointer ${meta.badgeBg} ${meta.badgeText} ${meta.borderColor}`}
                                style={{
                                  backgroundColor: isLight ? meta.accentColor : undefined,
                                  color: isLight ? '#ffffff' : undefined,
                                  borderColor: isLight ? meta.accentColor : undefined,
                                }}
                              >
                                {EQUIPMENT_CATEGORIES.map((c) => (
                                  <option key={c.key} value={c.key} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                                    {c.shortLabel}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-black inline-flex items-center gap-1.5 border shadow-xs ${meta.badgeBg} ${meta.badgeText} ${meta.borderColor}`}
                                style={{
                                  backgroundColor: isLight ? meta.accentColor : undefined,
                                  color: isLight ? '#ffffff' : undefined,
                                  borderColor: isLight ? meta.accentColor : undefined,
                                }}
                              >
                                {getCategoryIcon(item.category, 'w-3 h-3')}
                                <span>{meta.shortLabel}</span>
                              </span>
                            )}
                          </td>

                          {/* 2. Item Name & Prominent Package Open / Add Triggers */}
                          <td className="p-2.5 align-middle">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Open Kit Button */}
                              {isPackage && (
                                <button
                                  onClick={() => togglePackageExpand(item.id)}
                                  title={isExpanded ? 'Collapse package kit components' : 'Open package to view & add batteries, media cards, monitors, etc.'}
                                  aria-expanded={isExpanded}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 shadow-xs ${
                                    isExpanded
                                      ? 'bg-sky-600 text-white ring-2 ring-sky-400'
                                      : isLight
                                        ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs'
                                        : 'bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 border border-sky-500/30'
                                  }`}
                                >
                                  <Package className="w-3.5 h-3.5" />
                                  <span>{isExpanded ? 'Close Kit' : 'Open Kit'}</span>
                                  <span className="font-mono text-[10px] opacity-90">({packageItems.length})</span>
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              )}

                              {/* Quick "+ Add to Kit" button directly on row */}
                              {isPackage && isEditable && (
                                <button
                                  onClick={() => openAddPackageItemModal(item.id)}
                                  title={`Add batteries, media cards, monitor, or custom gear directly to ${item.name}`}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 transition-all shadow-xs ${
                                    isLight
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      : 'bg-emerald-600/20 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 text-emerald-300'
                                  }`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
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
                                  className={`${inputClass} font-black text-xs`}
                                />
                              ) : (
                                <span className="font-black text-xs text-slate-950 dark:text-slate-100">{item.name}</span>
                              )}

                              {item.isCustom ? (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black border flex-shrink-0 ${isLight ? 'bg-violet-100 text-violet-950 border-violet-300' : 'bg-violet-500/15 text-violet-400 border-violet-500/30'}`}>
                                  Custom
                                </span>
                              ) : (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black border flex-shrink-0 ${isLight ? 'bg-sky-100 text-sky-950 border-sky-300' : 'bg-sky-500/15 text-sky-400 border-sky-500/30'}`}>
                                  Canvas
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 3. Brand (Drop-Down) */}
                          <td className="p-2.5 align-middle">
                            {isEditable ? (
                              <select
                                value={item.brand || ''}
                                onChange={(e) => {
                                  const newBrand = e.target.value;
                                  const options = modelOptionsFor(item.category, newBrand);
                                  const keepModel = options.some((option) => option.model === item.model);
                                  const next = keepModel
                                    ? options.find((option) => option.model === item.model)
                                    : options[0];
                                  const linked = next && next.profile ? gearProfileUpdates(next.profile) : undefined;
                                  updateEquipmentItem(item.id, {
                                    brand: newBrand,
                                    model: next ? next.model : item.model,
                                    fixtureProfileId: linked?.fixtureProfileId,
                                    fixtureModeId: linked?.fixtureModeId,
                                    ...(specsIsDerived(item.specs, item.fixtureProfileId, item.fixtureModeId)
                                      ? { specs: linked?.specs || undefined }
                                      : {}),
                                  });
                                  syncFixtureLinkToElement(item, next?.profile, linked?.fixtureModeId);
                                }}
                                title="Select brand from the department catalog or fixture database"
                                className={`${inputClass} cursor-pointer`}
                              >
                                {!item.brand && <option value="" disabled>Select brand…</option>}
                                <BrandOptions options={brandSelectOptions} />
                              </select>
                            ) : (
                              <span className="font-bold text-slate-950 dark:text-slate-200">
                                {item.brand || <span className="opacity-40 font-normal">—</span>}
                              </span>
                            )}
                          </td>

                          {/* 4. Model / Variant (Drop-Down) */}
                          <td className="p-2.5 align-middle">
                            {isEditable ? (
                              <select
                                value={item.model || ''}
                                onChange={(e) => {
                                  const newModel = e.target.value;
                                  const chosen = modelSelectOptions.find((option) => option.model === newModel);
                                  const linked = chosen && chosen.profile ? gearProfileUpdates(chosen.profile) : undefined;
                                  const updates: Partial<EquipmentItem> = {
                                    model: newModel,
                                    fixtureProfileId: linked?.fixtureProfileId,
                                    fixtureModeId: linked?.fixtureModeId,
                                  };
                                  if (linked) updates.brand = linked.brand;
                                  if (specsIsDerived(item.specs, item.fixtureProfileId, item.fixtureModeId)) {
                                    updates.specs = linked?.specs || undefined;
                                  }
                                  if (!item.name || item.name.includes('Package') || item.name.includes('Custom')) {
                                    updates.name = newModel;
                                  }
                                  updateEquipmentItem(item.id, updates);
                                  syncFixtureLinkToElement(item, chosen?.profile, linked?.fixtureModeId);
                                }}
                                title="Select model for this brand — ◆ entries carry DMX modes and specs"
                                className={`${inputClass} font-mono text-[11px] cursor-pointer`}
                              >
                                {!item.model && <option value="" disabled>Select model…</option>}
                                <ModelOptions options={modelSelectOptions} />
                              </select>
                            ) : (
                              <span className="font-mono text-[11px] font-bold text-slate-950 dark:text-slate-300">
                                {item.model || <span className="opacity-40 font-normal">—</span>}
                              </span>
                            )}
                            {rowProfile && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                <span
                                  title={`Linked to fixture database: ${rowProfile.manufacturer} ${rowProfile.model} · ${fixtureSpecsLine(rowProfile, item.fixtureModeId) || 'no measured data'}`}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-black border ${
                                    isLight ? 'bg-violet-100 text-violet-950 border-violet-300' : 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                                  }`}
                                >
                                  ◆ {(() => {
                                    const mode = rowProfile.modes.find((candidate) => candidate.id === item.fixtureModeId) ?? rowProfile.modes[0];
                                    return mode ? fixtureModeLabel(mode) : 'DB';
                                  })()}
                                </span>
                                {/* The patch bay addresses fixtures on the plan.
                                    A row that is not on the plan therefore has
                                    nothing to patch — say so, and offer the one
                                    step that fixes it. */}
                                {isEditable && !resolveItemElementId(item) && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      placeFixtureOnPlan(item, rowProfile);
                                    }}
                                    title="Not on the floor plan, so the DMX patch cannot address it. Place it to make it patchable."
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black border ${
                                      isLight ? 'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200' : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                                    }`}
                                  >
                                    Place on plan to patch
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 5. Quantity Stepper */}
                          <td className="p-2.5 align-middle text-center">
                            <div className={`inline-flex items-center rounded-lg border overflow-hidden text-xs ${isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-700 bg-black/40'}`}>
                              {isEditable && (
                                <button
                                  onClick={() =>
                                    updateEquipmentItem(item.id, {
                                      quantity: Math.max(1, item.quantity - 1),
                                    })
                                  }
                                  title="Decrease quantity"
                                  aria-label={`Decrease quantity for ${item.name}`}
                                  className="px-2 py-0.5 hover:bg-slate-300 dark:hover:bg-slate-500/20 transition-colors font-mono font-black text-slate-950 dark:text-slate-300"
                                >
                                  -
                                </button>
                              )}
                              {isEditable ? (
                                <input
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  aria-label={`Quantity for ${item.name}`}
                                  onChange={(e) =>
                                    updateEquipmentItem(item.id, {
                                      quantity: Math.max(1, Number(e.target.value) || 1),
                                    })
                                  }
                                  className="w-10 bg-transparent text-center font-mono font-black py-0.5 focus:outline-hidden text-slate-950 dark:text-slate-100"
                                />
                              ) : (
                                <span className="px-2.5 py-0.5 font-mono font-black text-center min-w-[28px] text-slate-950 dark:text-slate-100">
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
                                  aria-label={`Increase quantity for ${item.name}`}
                                  className="px-2 py-0.5 hover:bg-slate-300 dark:hover:bg-slate-500/20 transition-colors font-mono font-black text-slate-950 dark:text-slate-300"
                                >
                                  +
                                </button>
                              )}
                            </div>
                          </td>

                          {/* 6. Role / Function */}
                          <td className="p-2.5 align-middle">
                            {isEditable ? (
                              <input
                                type="text"
                                value={item.roleOrFunction || ''}
                                onChange={(e) =>
                                  updateEquipmentItem(item.id, { roleOrFunction: e.target.value })
                                }
                                placeholder="Role / function..."
                                className={`${inputClass} text-xs font-semibold`}
                              />
                            ) : (
                              <span className="text-slate-950 dark:text-slate-200 font-semibold">
                                {item.roleOrFunction || <span className="opacity-40 font-normal">—</span>}
                              </span>
                            )}
                          </td>

                          {/* 7. Specs & Notes */}
                          <td className="p-2.5 align-middle">
                            {isEditable ? (
                              <input
                                type="text"
                                value={item.specs || item.notes || ''}
                                onChange={(e) =>
                                  updateEquipmentItem(item.id, { specs: e.target.value })
                                }
                                placeholder="Technical specs & notes..."
                                className={`${inputClass} text-[11px] font-medium`}
                              />
                            ) : (
                              <span className="text-[11px] text-slate-800 dark:text-slate-300 font-medium">
                                {item.specs || item.notes || <span className="opacity-40 font-normal">—</span>}
                              </span>
                            )}
                          </td>

                          {/* Master Scene Usage (All Scenes View) */}
                          {scope === 'all' && masterItem && (
                            <td className="p-2.5 align-middle text-[10px] font-mono text-slate-950 dark:text-slate-300">
                              <div className="flex flex-wrap gap-1 items-center">
                                {masterItem.usedInSetups.map((s, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${isLight ? 'bg-violet-100 text-violet-950 border-violet-300' : 'bg-violet-500/15 text-violet-300 border-violet-500/20'}`}
                                  >
                                    {s.sceneNumber ? `Sc ${s.sceneNumber}` : s.name} (×{s.quantity})
                                  </span>
                                ))}
                              </div>
                              <div className="text-[10px] font-bold opacity-80 mt-0.5">
                                Peak: {masterItem.maxConcurrentQuantity} concurrent
                              </div>
                            </td>
                          )}

                          {/* 8. Row Actions */}
                          {isEditable && (
                            <td className="p-2.5 align-middle text-right pr-3">
                              <div className="inline-flex items-center gap-1">
                                {resolveItemElementId(item) && (
                                  <button
                                    onClick={() => locateGearOnPlan(item)}
                                    title="Show this item on the floor plan"
                                    aria-label="Show this item on the floor plan"
                                    className="p-1.5 rounded hover:bg-cyan-100 hover:text-cyan-700 dark:hover:bg-cyan-500/15 dark:hover:text-cyan-400 text-slate-700 dark:text-slate-400 transition-colors"
                                  >
                                    <Crosshair className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => openEditModal(item)}
                                  title="Open full edit modal"
                                  aria-label="Open full edit modal"
                                  className="p-1.5 rounded hover:bg-sky-100 hover:text-sky-700 dark:hover:bg-sky-500/15 dark:hover:text-sky-400 text-slate-700 dark:text-slate-400 transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
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
                                  aria-label="Duplicate item"
                                  className="p-1.5 rounded hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-400 text-slate-700 dark:text-slate-400 transition-colors"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteEquipmentItem(item.id)}
                                  title="Delete item"
                                  aria-label="Delete item"
                                  className="p-1.5 rounded hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/15 dark:hover:text-rose-400 text-slate-700 dark:text-slate-400 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>

                        {/* ============================================================= */}
                        {/* NESTED OPENABLE PACKAGE KIT DRAWER (BATTERIES, CARDS, MONITORS)*/}
                        {/* ============================================================= */}
                        {isPackage && isExpanded && (
                          <tr className={isLight ? 'bg-sky-50/90 border-b-2 border-sky-400 text-slate-950' : 'bg-slate-950/95 border-b-2 border-sky-800 text-slate-100'}>
                            <td colSpan={scope === 'all' ? 8 : 8} className="p-0">
                              <div className="pl-6 pr-3 py-3 border-l-4 border-sky-600 flex flex-col gap-2.5">
                                {/* Kit Header Bar */}
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-md ${isLight ? 'bg-sky-200 text-sky-900' : 'bg-sky-500/20 text-sky-400'}`}>
                                      <Package className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <span className="text-xs font-black uppercase tracking-wider text-sky-950 dark:text-sky-300 font-mono flex items-center gap-1.5">
                                        <span>{item.name} — Kit Accessories Manifest</span>
                                        <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${isLight ? 'bg-sky-200 text-sky-950 border border-sky-300' : 'bg-sky-500/20 text-sky-300'}`}>
                                          {packageItems.length} components · {packageItems.reduce((s, p) => s + p.quantity, 0)} units
                                        </span>
                                      </span>
                                      <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-400">
                                        Batteries, memory cards, on-camera monitors, wireless transmitters, follow focus systems & gear
                                      </p>
                                    </div>
                                  </div>

                                  {isEditable && (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => openAddPackageItemModal(item.id)}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1 shadow-md transition-all"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>+ Add Custom Item to {item.name.split(' ')[0]}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* 1-Click Fast Presets Toolbar for this Camera Package */}
                                {isEditable && (
                                  <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${isLight ? 'bg-white border-sky-300 shadow-xs' : 'bg-sky-500/10 border-sky-500/20'}`}>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-black font-mono uppercase text-sky-950 dark:text-sky-400 flex items-center gap-1">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                        <span>1-Click Fast Presets (Click any button to immediately attach to {item.name}):</span>
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {CAMERA_PACKAGE_PRESETS.map((pkgPreset, pIdx) => (
                                        <button
                                          key={pIdx}
                                          onClick={() => handleAddPackagePreset(item.id, pkgPreset)}
                                          title={`Add ${pkgPreset.name} to ${item.name} (${pkgPreset.specs})`}
                                          className={`px-2.5 py-1 rounded-lg text-left border text-[11px] font-black transition-all flex items-center gap-1 group shadow-2xs ${
                                            isLight
                                              ? 'bg-slate-50 border-slate-300 hover:bg-sky-600 hover:text-white hover:border-sky-600 text-slate-950'
                                              : 'bg-slate-900 border-sky-800 hover:bg-sky-600 hover:text-white hover:border-sky-500 text-slate-200'
                                          }`}
                                        >
                                          <Plus className="w-3 h-3 text-sky-600 dark:text-sky-400 group-hover:text-white flex-shrink-0" />
                                          <span>{pkgPreset.name}</span>
                                          <span className="font-mono text-[10px] opacity-80 ml-0.5">x{pkgPreset.quantity}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Kit Sub-Items Table */}
                                <div className={`border-2 rounded-xl overflow-hidden shadow-md ${isLight ? 'border-sky-300 bg-white text-slate-950' : 'border-sky-500/30 bg-slate-900 text-slate-100'}`}>
                                  <table className="w-full text-left text-xs border-collapse font-sans">
                                    <thead>
                                      <tr className={`border-b text-[10px] font-mono uppercase font-black ${isLight ? 'bg-sky-100 text-sky-950 border-sky-300' : 'bg-slate-950 text-slate-200 border-slate-800'}`}>
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
                                              <Package className="w-8 h-8 opacity-40 text-sky-600 dark:text-sky-400" />
                                              <p className="text-xs font-black text-slate-950 dark:text-slate-200">
                                                This camera package has no items yet.
                                              </p>
                                              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-400">
                                                Click the preset buttons above (like <strong>V-Mount Batteries</strong> or <strong>CFexpress Cards</strong>) or click <strong>"+ Add Custom Item"</strong> below to load accessories.
                                              </p>
                                              {isEditable && (
                                                <div className="flex items-center gap-2 mt-2">
                                                  <button
                                                    onClick={() => handleAddPackagePreset(item.id, CAMERA_PACKAGE_PRESETS[0])}
                                                    className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-black flex items-center gap-1 shadow-xs"
                                                  >
                                                    <Plus className="w-3.5 h-3.5" /> + Add Batteries
                                                  </button>
                                                  <button
                                                    onClick={() => handleAddPackagePreset(item.id, CAMERA_PACKAGE_PRESETS[2])}
                                                    className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-black flex items-center gap-1 shadow-xs"
                                                  >
                                                    <Plus className="w-3.5 h-3.5" /> + Add Media Cards
                                                  </button>
                                                  <button
                                                    onClick={() => openAddPackageItemModal(item.id)}
                                                    className={`px-3 py-1 rounded-lg border text-xs font-black flex items-center gap-1 ${isLight ? 'border-sky-500 text-sky-900 bg-sky-50 hover:bg-sky-100' : 'border-sky-500 text-sky-400 hover:bg-sky-500/10'}`}
                                                  >
                                                    <Plus className="w-3.5 h-3.5" /> + Custom Item
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      ) : (
                                        packageItems.map((subItem) => {
                                          const subMeta = getCategoryMeta(subItem.category);
                                          const subBrands = getBrandsForCategory(subItem.category);
                                          const subModels = getModelsForBrand(subItem.category, subItem.brand || '');
                                          const subBrandOptions = subBrands.includes(subItem.brand || '')
                                            ? subBrands
                                            : subItem.brand
                                              ? [subItem.brand, ...subBrands]
                                              : subBrands;
                                          const subModelOptions = subModels.includes(subItem.model || '')
                                            ? subModels
                                            : subItem.model
                                              ? [subItem.model, ...subModels]
                                              : subModels;
                                          return (
                                            <tr
                                              key={subItem.id}
                                              className={isLight ? 'bg-white hover:bg-sky-50 text-slate-950' : 'hover:bg-slate-850/70 text-slate-100'}
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
                                                    className={`text-[10px] font-black uppercase tracking-wide rounded px-2 py-0.5 border shadow-2xs cursor-pointer ${subMeta.badgeBg} ${subMeta.badgeText} ${subMeta.borderColor}`}
                                                    style={{
                                                      backgroundColor: isLight ? subMeta.accentColor : undefined,
                                                      color: isLight ? '#ffffff' : undefined,
                                                      borderColor: isLight ? subMeta.accentColor : undefined,
                                                    }}
                                                  >
                                                    {EQUIPMENT_CATEGORIES.map((c) => (
                                                      <option key={c.key} value={c.key} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                                                        {c.shortLabel}
                                                      </option>
                                                    ))}
                                                  </select>
                                                ) : (
                                                  <span
                                                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border shadow-2xs ${subMeta.badgeBg} ${subMeta.badgeText} ${subMeta.borderColor}`}
                                                    style={{
                                                      backgroundColor: isLight ? subMeta.accentColor : undefined,
                                                      color: isLight ? '#ffffff' : undefined,
                                                      borderColor: isLight ? subMeta.accentColor : undefined,
                                                    }}
                                                  >
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
                                                    className={`${inputClass} text-xs font-black`}
                                                  />
                                                ) : (
                                                  <span className="text-xs font-black text-slate-950 dark:text-slate-100">{subItem.name}</span>
                                                )}
                                              </td>

                                              {/* Sub Brand */}
                                              <td className="p-2 align-middle">
                                                {isEditable ? (
                                                  <select
                                                    value={subItem.brand || ''}
                                                    onChange={(e) => {
                                                      const newBrand = e.target.value;
                                                      const models = getModelsForBrand(subItem.category, newBrand);
                                                      updatePackageItem(item.id, subItem.id, {
                                                        brand: newBrand,
                                                        model: models.length > 0 && !models.includes(subItem.model || '') ? models[0] : subItem.model,
                                                      });
                                                    }}
                                                    title="Select brand from department catalog"
                                                    className={`${inputClass} text-xs cursor-pointer`}
                                                  >
                                                    {!subItem.brand && <option value="" disabled>Select brand…</option>}
                                                    {subBrandOptions.map((b) => (
                                                      <option key={b} value={b} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                                                        {b}
                                                      </option>
                                                    ))}
                                                  </select>
                                                ) : (
                                                  <span className="text-xs font-bold text-slate-950 dark:text-slate-200">{subItem.brand || '—'}</span>
                                                )}
                                              </td>

                                              {/* Sub Model */}
                                              <td className="p-2 align-middle">
                                                {isEditable ? (
                                                  <select
                                                    value={subItem.model || ''}
                                                    onChange={(e) =>
                                                      updatePackageItem(item.id, subItem.id, { model: e.target.value })
                                                    }
                                                    title="Select model for this brand"
                                                    className={`${inputClass} text-[11px] font-mono cursor-pointer`}
                                                  >
                                                    {!subItem.model && <option value="" disabled>Select model…</option>}
                                                    {subModelOptions.map((m) => (
                                                      <option key={m} value={m} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-mono font-bold">
                                                        {m}
                                                      </option>
                                                    ))}
                                                  </select>
                                                ) : (
                                                  <span className="text-[11px] font-mono font-bold text-slate-950 dark:text-slate-300">{subItem.model || '—'}</span>
                                                )}
                                              </td>

                                              {/* Sub Quantity */}
                                              <td className="p-2 align-middle text-center">
                                                <div className={`inline-flex items-center rounded-lg border overflow-hidden text-xs ${isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-700 bg-black/40'}`}>
                                                  {isEditable && (
                                                    <button
                                                      onClick={() =>
                                                        updatePackageItem(item.id, subItem.id, {
                                                          quantity: Math.max(1, subItem.quantity - 1),
                                                        })
                                                      }
                                                      title="Decrease quantity"
                                                      aria-label={`Decrease quantity for ${subItem.name}`}
                                                      className="px-1.5 py-0.5 hover:bg-slate-300 font-mono font-black text-slate-950 dark:text-slate-300"
                                                    >
                                                      -
                                                    </button>
                                                  )}
                                                  {isEditable ? (
                                                    <input
                                                      type="number"
                                                      min={1}
                                                      value={subItem.quantity}
                                                      aria-label={`Quantity for ${subItem.name}`}
                                                      onChange={(e) =>
                                                        updatePackageItem(item.id, subItem.id, {
                                                          quantity: Math.max(1, Number(e.target.value) || 1),
                                                        })
                                                      }
                                                      className="w-10 bg-transparent text-center font-mono font-black py-0.5 focus:outline-hidden text-slate-950 dark:text-slate-100"
                                                    />
                                                  ) : (
                                                    <span className="px-2 py-0.5 font-mono font-black text-center text-slate-950 dark:text-slate-100">
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
                                                      title="Increase quantity"
                                                      aria-label={`Increase quantity for ${subItem.name}`}
                                                      className="px-1.5 py-0.5 hover:bg-slate-300 font-mono font-black text-slate-950 dark:text-slate-300"
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
                                                    className={`${inputClass} text-xs font-semibold`}
                                                  />
                                                ) : (
                                                  <span className="text-xs font-semibold text-slate-950 dark:text-slate-200">{subItem.roleOrFunction || '—'}</span>
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
                                                    className={`${inputClass} text-[11px] font-medium`}
                                                  />
                                                ) : (
                                                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-300">{subItem.specs || '—'}</span>
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
                                                      aria-label="Duplicate accessory"
                                                      className="p-1 rounded hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-400 text-slate-700 dark:text-slate-400 transition-colors"
                                                    >
                                                      <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                      onClick={() => deletePackageItem(item.id, subItem.id)}
                                                      title="Remove from package"
                                                      aria-label="Remove from package"
                                                      className="p-1 rounded hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/15 dark:hover:text-rose-400 text-slate-700 dark:text-slate-400 transition-colors"
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
              className={`p-2.5 border-t flex items-center justify-between text-xs font-mono font-black ${
                isLight ? 'bg-slate-200 text-slate-950 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-800'
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
                  className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-black flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Row
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
                <div key={cat.key} className={`border-2 rounded-xl overflow-hidden shadow-xs ${cardBg}`}>
                  {/* Rubric Header */}
                  <div
                    className={`px-3.5 py-2.5 border-b flex items-center justify-between ${
                      isLight ? 'bg-slate-200 text-slate-950 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`p-1.5 rounded-md border ${cat.badgeBg} ${cat.badgeText} ${cat.borderColor}`}>
                        {getCategoryIcon(cat.key, 'w-4 h-4')}
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-950 dark:text-slate-100">{cat.label}</span>
                      <span className="text-[11px] font-mono font-bold opacity-80">
                        ({items.length} items · {rubricTotalQty} units)
                      </span>
                    </div>

                    {scope === 'current' && (
                      <button
                        onClick={() => openAddModal(cat.key)}
                        title={`Add item to ${cat.label}`}
                        aria-label={`Add item to ${cat.label}`}
                        className="p-1.5 rounded text-slate-800 hover:text-sky-700 hover:bg-sky-100 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-sky-500/10 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Rubric Items */}
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {items.map((item) => {
                      const isMaster = 'usedInSetups' in item;
                      const masterItem = isMaster ? (item as MasterEquipmentItem) : null;
                      const isPackage = item.isPackage || (item.packageItems && item.packageItems.length > 0) || item.name.includes('Package');
                      const isExpanded = !!expandedPackages[item.id];
                      const packageItems = item.packageItems || [];

                      return (
                        <div
                          key={item.id}
                          onClick={(e) => handleGearRowClick(e, item)}
                          onDoubleClick={() => {
                            if (scope === 'current') openEditModal(item);
                          }}
                          className={`p-3 flex flex-col gap-2 transition-colors cursor-pointer ${rowBg}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {isPackage && (
                                  <button
                                    onClick={() => togglePackageExpand(item.id)}
                                    aria-expanded={isExpanded}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 ${
                                      isExpanded
                                        ? 'bg-sky-600 text-white'
                                        : isLight
                                          ? 'bg-sky-600 text-white hover:bg-sky-700'
                                          : 'bg-sky-500/20 text-sky-300'
                                    }`}
                                  >
                                    <Package className="w-3.5 h-3.5" />
                                    <span>{isExpanded ? 'Close Kit' : 'Open Kit'}</span>
                                    <span className="font-mono text-[10px] opacity-90">({packageItems.length})</span>
                                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>
                                )}

                                {isPackage && scope === 'current' && (
                                  <button
                                    onClick={() => openAddPackageItemModal(item.id)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 ${
                                      isLight
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        : 'bg-emerald-600/20 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 text-emerald-300'
                                    }`}
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add Gear to Kit</span>
                                  </button>
                                )}

                                <span className="text-xs font-black leading-tight text-slate-950 dark:text-slate-100">{item.name}</span>
                                {item.isCustom ? (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black border ${isLight ? 'bg-violet-100 text-violet-950 border-violet-300' : 'bg-violet-500/15 text-violet-400 border-violet-500/30'}`}>
                                    Custom
                                  </span>
                                ) : (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black border ${isLight ? 'bg-sky-100 text-sky-950 border-sky-300' : 'bg-sky-500/15 text-sky-400 border-sky-500/30'}`}>
                                    Canvas
                                  </span>
                                )}
                                {item.roleOrFunction && (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isLight ? 'bg-slate-200 text-slate-950' : 'bg-slate-500/15 text-slate-300'}`}>
                                    {item.roleOrFunction}
                                  </span>
                                )}
                              </div>

                              {/* Brand & Model */}
                              {(item.brand || item.model) && (
                                <div className="text-xs font-mono text-slate-950 dark:text-slate-300 mt-1 flex items-center gap-1.5">
                                  {item.brand && <span className="font-black">{item.brand}</span>}
                                  {item.brand && item.model && <span>·</span>}
                                  {item.model && <span className="font-bold">{item.model}</span>}
                                </div>
                              )}

                              {/* Technical Specs */}
                              {item.specs && (
                                <div className="text-[11px] text-slate-800 dark:text-slate-400 mt-0.5 line-clamp-2 font-medium">
                                  {item.specs}
                                </div>
                              )}

                              {/* Master Scene Usage Tags */}
                              {masterItem && (
                                <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] font-mono uppercase font-black opacity-80">Used In:</span>
                                  {masterItem.usedInSetups.map((s, sIdx) => (
                                    <span
                                      key={sIdx}
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${isLight ? 'bg-violet-100 text-violet-950 border-violet-300' : 'bg-violet-500/15 text-violet-300 border-violet-500/20'}`}
                                    >
                                      {s.sceneNumber ? `Sc ${s.sceneNumber}` : s.name} (×{s.quantity})
                                    </span>
                                  ))}
                                  <span className="text-[10px] font-mono font-bold opacity-80 ml-1">
                                    · Peak Concurrent: {masterItem.maxConcurrentQuantity}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Quantity & Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Quantity pill / Stepper */}
                              <div className={`flex items-center rounded-lg border overflow-hidden text-xs ${isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-700 bg-black/40'}`}>
                                {scope === 'current' && (
                                  <button
                                    onClick={() =>
                                      updateEquipmentItem(item.id, {
                                        quantity: Math.max(1, item.quantity - 1),
                                      })
                                    }
                                    title="Decrease quantity"
                                    aria-label={`Decrease quantity for ${item.name}`}
                                    className="px-2 py-0.5 hover:bg-slate-300 dark:hover:bg-slate-500/20 transition-colors font-mono font-black text-slate-950 dark:text-slate-300"
                                  >
                                    -
                                  </button>
                                )}
                                <span className="px-2.5 py-0.5 font-mono font-black text-center min-w-[28px] text-slate-950 dark:text-slate-100">
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
                                    aria-label={`Increase quantity for ${item.name}`}
                                    className="px-2 py-0.5 hover:bg-slate-300 dark:hover:bg-slate-500/20 transition-colors font-mono font-black text-slate-950 dark:text-slate-300"
                                  >
                                    +
                                  </button>
                                )}
                              </div>

                              {/* Item Actions */}
                              {scope === 'current' && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => openEditModal(item)}
                                    title="Edit brand, model, name, or specs"
                                    aria-label="Edit brand, model, name, or specs"
                                    className="p-1.5 rounded hover:bg-sky-100 hover:text-sky-700 dark:hover:bg-sky-500/15 dark:hover:text-sky-400 text-slate-700 dark:text-slate-400 transition-colors"
                                  >
                                    <Edit2 className="w-4 h-4" />
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
                                    aria-label="Duplicate item"
                                    className="p-1.5 rounded hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-400 text-slate-700 dark:text-slate-400 transition-colors"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => deleteEquipmentItem(item.id)}
                                    title="Delete item"
                                    aria-label="Delete item"
                                    className="p-1.5 rounded hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/15 dark:hover:text-rose-400 text-slate-700 dark:text-slate-400 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Nested Package Items in Card View */}
                          {isPackage && isExpanded && (
                            <div className={`mt-1 pl-3 border-l-4 border-sky-600 flex flex-col gap-2 p-2.5 rounded-r-xl ${isLight ? 'bg-sky-50 border-sky-300' : 'bg-black/30'}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-sky-950 dark:text-sky-300 font-mono">
                                  Package Kit Components ({packageItems.length})
                                </span>
                                {scope === 'current' && (
                                  <button
                                    onClick={() => openAddPackageItemModal(item.id)}
                                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black flex items-center gap-0.5 shadow-xs"
                                  >
                                    <Plus className="w-3 h-3" /> + Add Gear
                                  </button>
                                )}
                              </div>

                              <div className="space-y-1.5">
                                {packageItems.map((sub) => (
                                  <div
                                    key={sub.id}
                                    className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border ${
                                      isLight
                                        ? 'bg-white border-slate-300 text-slate-950 shadow-2xs'
                                        : 'bg-slate-900 border-slate-700 text-slate-100'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-black text-sky-700 dark:text-sky-400">x{sub.quantity}</span>
                                      <span className="font-black text-slate-950 dark:text-slate-100">{sub.name}</span>
                                      {sub.brand && <span className="font-semibold text-slate-700 dark:text-slate-300">· {sub.brand}</span>}
                                    </div>
                                    {scope === 'current' && (
                                      <button
                                        onClick={() => deletePackageItem(item.id, sub.id)}
                                        title={`Remove ${sub.name} from this package`}
                                        aria-label={`Remove ${sub.name} from this package`}
                                        className="text-slate-600 hover:text-rose-600 p-0.5 dark:text-slate-400 dark:hover:text-rose-400"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div
            ref={addModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${fieldId}-add-equipment-title`}
            tabIndex={-1}
            className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl outline-hidden ${
              isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${isLight ? 'bg-sky-100 text-sky-900' : 'bg-sky-500/15 text-sky-400'}`}>
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <h3 id={`${fieldId}-add-equipment-title`} className="text-sm font-black text-slate-950 dark:text-slate-100">
                    {editingItem ? 'Edit Production Equipment' : 'Add Production Equipment'}
                  </h3>
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Scene {activeSetup.sceneNumber || '1'}: {activeSetup.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                title="Close"
                aria-label="Close"
                className="p-1 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="mt-4 flex flex-col gap-3.5">
              {/* Optional: Target Package Selector */}
              {!editingItem && availableCameraPackages.length > 0 && (
                <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-sky-50 border-sky-300' : 'bg-sky-500/10 border-sky-500/30'}`}>
                  <label htmlFor={`${fieldId}-destination-package-optional`} className="block text-[11px] font-black uppercase tracking-wider text-sky-950 dark:text-sky-400 mb-1">
                    📦 Destination Package (Optional)
                  </label>
                  <select id={`${fieldId}-destination-package-optional`}
                    value={formData.targetPackageId || ''}
                    onChange={(e) => setFormData({ ...formData, targetPackageId: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border font-bold ${
                      isLight ? 'bg-white text-slate-950 border-sky-400' : 'bg-slate-800 text-slate-100 border-sky-700'
                    }`}
                  >
                    <option value="" className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                      -- Standalone Item (Not in package) --
                    </option>
                    {availableCameraPackages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                        Attach directly inside {pkg.name} (Camera Kit)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Category Rubric */}
              <div>
                <label htmlFor={`${fieldId}-department-category-rubric`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                  Department / Category Rubric
                </label>
                <select id={`${fieldId}-department-category-rubric`}
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
                      // The old link belonged to a fixture in another department.
                      fixtureProfileId: undefined,
                      fixtureModeId: undefined,
                      specs: specsIsDerived(formData.specs, formData.fixtureProfileId, formData.fixtureModeId)
                        ? ''
                        : formData.specs,
                    });
                  }}
                  className={`w-full p-2 text-xs rounded-lg border font-bold ${
                    isLight ? 'bg-white text-slate-950 border-slate-300' : 'bg-slate-800 text-slate-100 dark:border-slate-700'
                  }`}
                >
                  {EQUIPMENT_CATEGORIES.map((cat) => (
                    <option key={cat.key} value={cat.key} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Brand & Model Templates Selector */}
              <div className={`grid grid-cols-2 gap-2 p-2.5 rounded-xl border ${isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950/60 border-slate-700'}`}>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-950 dark:text-slate-300">
                      Brand Template
                    </span>
                    <span className="text-[9px] font-bold opacity-70">Dropdown</span>
                  </div>
                  <select
                    aria-label="Brand Template"
                    value={formData.brand}
                    onChange={(e) => {
                      const newBrand = e.target.value;
                      const options = modelOptionsFor(formData.category, newBrand);
                      const first = options[0];
                      const linked = first && first.profile ? gearProfileUpdates(first.profile) : undefined;
                      setFormData({
                        ...formData,
                        brand: newBrand,
                        model: first ? first.model : '',
                        name: (first && first.model) || formData.name,
                        fixtureProfileId: linked?.fixtureProfileId,
                        fixtureModeId: linked?.fixtureModeId,
                        specs: specsIsDerived(formData.specs, formData.fixtureProfileId, formData.fixtureModeId)
                          ? linked?.specs ?? ''
                          : formData.specs,
                      });
                    }}
                    className={`w-full p-1.5 text-xs rounded-lg border font-bold ${
                      isLight ? 'bg-white text-slate-950 border-slate-300' : 'bg-slate-800 text-slate-100 border-slate-700'
                    }`}
                  >
                    <option value="" className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">-- Custom Brand --</option>
                    <BrandOptions options={brandOptionsFor(formData.category)} />
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-950 dark:text-slate-300">
                      Model Template
                    </span>
                    <span className="text-[9px] font-bold opacity-70">Dropdown</span>
                  </div>
                  <select
                    aria-label="Model Template"
                    value={formData.model}
                    onChange={(e) => {
                      const newModel = e.target.value;
                      const chosen = modelOptionsFor(formData.category, formData.brand).find(
                        (option) => option.model === newModel,
                      );
                      const linked = chosen && chosen.profile ? gearProfileUpdates(chosen.profile) : undefined;
                      setFormData({
                        ...formData,
                        model: newModel,
                        name: newModel || formData.name,
                        // Picking the database entry under a brand written as
                        // a pairing ("Aputure / Amaran") also settles the brand.
                        brand: linked?.brand ?? formData.brand,
                        fixtureProfileId: linked?.fixtureProfileId,
                        fixtureModeId: linked?.fixtureModeId,
                        specs: specsIsDerived(formData.specs, formData.fixtureProfileId, formData.fixtureModeId)
                          ? linked?.specs ?? ''
                          : formData.specs,
                      });
                    }}
                    className={`w-full p-1.5 text-xs rounded-lg border font-mono text-[11px] font-bold ${
                      isLight ? 'bg-white text-slate-950 border-slate-300' : 'bg-slate-800 text-slate-100 border-slate-700'
                    }`}
                  >
                    <option value="" className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">-- Custom Model --</option>
                    <ModelOptions options={modelOptionsFor(formData.category, formData.brand)} />
                  </select>
                </div>
              </div>

              {/* Linked database fixture: DMX personality + technical card */}
              {(() => {
                const profile = profileById(formData.fixtureProfileId);
                if (!profile) {
                  if (!usesFixtureDatabase(formData.category)) return null;
                  return (
                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 -mt-1">
                      Models marked ◆ come from the fixture database and bring DMX modes, wattage and weight with them.
                    </p>
                  );
                }
                const mode = profile.modes.find((candidate) => candidate.id === formData.fixtureModeId) ?? profile.modes[0];
                return (
                  <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-violet-50 border-violet-300' : 'bg-violet-500/10 border-violet-500/30'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-black uppercase tracking-wider text-violet-950 dark:text-violet-300">
                        ◆ Fixture database
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            fixtureProfileId: undefined,
                            fixtureModeId: undefined,
                            specs: specsIsDerived(formData.specs, formData.fixtureProfileId, formData.fixtureModeId) ? '' : formData.specs,
                          })
                        }
                        className="text-[10px] font-bold underline opacity-70 hover:opacity-100"
                      >
                        Unlink
                      </button>
                    </div>
                    <p className="text-[11px] font-bold text-slate-950 dark:text-slate-100">
                      {profile.manufacturer} {profile.model}
                    </p>
                    {profile.modes.length > 0 ? (
                      <>
                        <label htmlFor={`${fieldId}-dmx-personality`} className="block text-[10px] font-black uppercase tracking-wider mt-2 mb-1 text-slate-950 dark:text-slate-300">
                          DMX Personality
                        </label>
                        <select
                          id={`${fieldId}-dmx-personality`}
                          value={mode?.id ?? ''}
                          onChange={(e) => {
                            const updates = gearProfileUpdates(profile, e.target.value);
                            setFormData({
                              ...formData,
                              fixtureModeId: updates.fixtureModeId,
                              specs: specsIsDerived(formData.specs, formData.fixtureProfileId, formData.fixtureModeId)
                                ? updates.specs
                                : formData.specs,
                            });
                          }}
                          className={`w-full p-1.5 text-xs rounded-lg border font-bold ${
                            isLight ? 'bg-white text-slate-950 border-violet-300' : 'bg-slate-800 text-slate-100 border-violet-700'
                          }`}
                        >
                          {profile.modes.map((candidate) => (
                            <option key={candidate.id} value={candidate.id} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                              {fixtureModeLabel(candidate)}
                            </option>
                          ))}
                        </select>
                        {mode?.channels && mode.channels.length > 0 && (
                          <p className="mt-1.5 text-[10px] font-mono leading-relaxed text-slate-700 dark:text-slate-300 max-h-16 overflow-y-auto custom-scrollbar">
                            {mode.channels.map((channel) => `${channel.offset}. ${channel.name}`).join(' · ')}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                        No DMX modes listed for this fixture.
                      </p>
                    )}
                    <p className="mt-1.5 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                      {fixtureSpecsLine(profile, mode?.id) || 'No measured data'}
                    </p>
                  </div>
                );
              })()}

              {/* Item Name & Quantity */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label htmlFor={`${fieldId}-item-name`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                    Item Name *
                  </label>
                  <input id={`${fieldId}-item-name`}
                    type="text"
                    required
                    placeholder="e.g. Camera A Package, ARRI SkyPanel S60-C, Sony FX6"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border font-black focus:ring-2 focus:ring-sky-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-quantity`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                    Quantity
                  </label>
                  <input id={`${fieldId}-quantity`}
                    type="number"
                    min={1}
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, quantity: Math.max(1, Number(e.target.value)) })
                    }
                    className={`w-full p-2 text-xs rounded-lg border font-mono font-black text-center focus:ring-2 focus:ring-sky-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Freehand Brand & Model Customization */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`${fieldId}-brand-manufacturer`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                    Brand / Manufacturer
                  </label>
                  <input id={`${fieldId}-brand-manufacturer`}
                    type="text"
                    placeholder="e.g. ARRI, Aputure, Nanlite"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border font-bold focus:ring-2 focus:ring-sky-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-model-variant`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                    Model / Variant
                  </label>
                  <input id={`${fieldId}-model-variant`}
                    type="text"
                    placeholder="e.g. SkyPanel S60-C, LS 600d Pro"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border font-mono font-bold text-[11px] focus:ring-2 focus:ring-sky-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Role / Function */}
              <div>
                <label htmlFor={`${fieldId}-production-role-function`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                  Production Role / Function
                </label>
                <input id={`${fieldId}-production-role-function`}
                  type="text"
                  placeholder="e.g. Key Light, Backlight / Rim, A-Cam Main, Overhead Boom"
                  value={formData.roleOrFunction}
                  onChange={(e) => setFormData({ ...formData, roleOrFunction: e.target.value })}
                  className={`w-full p-2 text-xs rounded-lg border font-bold focus:ring-2 focus:ring-sky-500 ${
                    isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              {/* Technical Specs & Notes */}
              <div>
                <label htmlFor={`${fieldId}-technical-specs-notes`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                  Technical Specs & Notes
                </label>
                <textarea id={`${fieldId}-technical-specs-notes`}
                  rows={2}
                  placeholder="e.g. 5600K · 100% · Barn Doors, V-Lock mount, 12G 4K60p rated"
                  value={formData.specs}
                  onChange={(e) => setFormData({ ...formData, specs: e.target.value })}
                  className={`w-full p-2 text-xs rounded-lg border font-medium focus:ring-2 focus:ring-sky-500 custom-scrollbar ${
                    isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${
                    isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-900' : 'border-slate-700 hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-black rounded-lg bg-sky-600 hover:bg-sky-700 text-white shadow-md flex items-center gap-1"
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
            ref={addPackageItemModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${fieldId}-add-package-item-title`}
            tabIndex={-1}
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl outline-hidden ${
              isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${isLight ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 id={`${fieldId}-add-package-item-title`} className="text-sm font-black text-slate-950 dark:text-slate-100">
                    Add Gear to Camera Package
                  </h3>
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Attach batteries, media cards, monitor, transmitter, or accessories
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddPackageItemModalOpen(false)}
                title="Close"
                aria-label="Close"
                className="p-1 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePackageItemModal} className="mt-4 flex flex-col gap-3">
              {/* Preset Quick Loader */}
              <div>
                <label htmlFor={`${fieldId}-choose-preset-or-type-custom-below`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-emerald-700 dark:text-emerald-400">
                  ⚡ Choose Preset (Or type custom below)
                </label>
                <select id={`${fieldId}-choose-preset-or-type-custom-below`}
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
                  className={`w-full p-2 text-xs rounded-lg border font-bold ${
                    isLight ? 'bg-white text-slate-950 border-slate-300' : 'bg-slate-800 text-slate-100 dark:border-slate-700'
                  }`}
                >
                  <option value="" className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                    -- Select Camera Accessory Preset --
                  </option>
                  {CAMERA_PACKAGE_PRESETS.map((p, idx) => (
                    <option key={idx} value={p.name} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                      {p.name} (x{p.quantity}) - {p.brand}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label htmlFor={`${fieldId}-category-rubric`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                  Category Rubric
                </label>
                <select id={`${fieldId}-category-rubric`}
                  value={packageFormData.category}
                  onChange={(e) =>
                    setPackageFormData({ ...packageFormData, category: e.target.value as EquipmentCategory })
                  }
                  className={`w-full p-2 text-xs rounded-lg border font-bold ${
                    isLight ? 'bg-white text-slate-950 border-slate-300' : 'bg-slate-800 text-slate-100 dark:border-slate-700'
                  }`}
                >
                  {EQUIPMENT_CATEGORIES.map((cat) => (
                    <option key={cat.key} value={cat.key} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Item Name & Quantity */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label htmlFor={`${fieldId}-accessory-name`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                    Accessory Name *
                  </label>
                  <input id={`${fieldId}-accessory-name`}
                    type="text"
                    required
                    placeholder="e.g. V-Mount Batteries, CFexpress Type B"
                    value={packageFormData.name}
                    onChange={(e) => setPackageFormData({ ...packageFormData, name: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border font-black ${
                      isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-quantity-2`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                    Quantity
                  </label>
                  <input id={`${fieldId}-quantity-2`}
                    type="number"
                    min={1}
                    value={packageFormData.quantity}
                    onChange={(e) =>
                      setPackageFormData({ ...packageFormData, quantity: Math.max(1, Number(e.target.value)) })
                    }
                    className={`w-full p-2 text-xs rounded-lg border font-mono font-black text-center ${
                      isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Brand & Model */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`${fieldId}-brand`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                    Brand
                  </label>
                  <input id={`${fieldId}-brand`}
                    type="text"
                    placeholder="e.g. Anton Bauer, SanDisk, SmallHD"
                    value={packageFormData.brand}
                    onChange={(e) => setPackageFormData({ ...packageFormData, brand: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border font-bold ${
                      isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-model-variant-2`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                    Model / Variant
                  </label>
                  <input id={`${fieldId}-model-variant-2`}
                    type="text"
                    placeholder="e.g. Titon 150, Cine 7"
                    value={packageFormData.model}
                    onChange={(e) => setPackageFormData({ ...packageFormData, model: e.target.value })}
                    className={`w-full p-2 text-xs rounded-lg border font-mono font-bold text-[11px] ${
                      isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Role & Specs */}
              <div>
                <label htmlFor={`${fieldId}-role-function`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                  Role / Function
                </label>
                <input id={`${fieldId}-role-function`}
                  type="text"
                  placeholder="e.g. Camera Power, Recording Media, Focus Peaking"
                  value={packageFormData.roleOrFunction}
                  onChange={(e) => setPackageFormData({ ...packageFormData, roleOrFunction: e.target.value })}
                  className={`w-full p-2 text-xs rounded-lg border font-bold ${
                    isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              <div>
                <label htmlFor={`${fieldId}-technical-specs`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                  Technical Specs
                </label>
                <input id={`${fieldId}-technical-specs`}
                  type="text"
                  placeholder="e.g. 14.4V High-Draw · 150Wh · USB-C"
                  value={packageFormData.specs}
                  onChange={(e) => setPackageFormData({ ...packageFormData, specs: e.target.value })}
                  className={`w-full p-2 text-xs rounded-lg border font-medium ${
                    isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddPackageItemModalOpen(false)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${
                    isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-900' : 'border-slate-700 hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-black rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Attach to Package</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 8. DMX Universe View Modal */}
      {isUniverseViewOpen && scope === 'current' && (
        <DmxUniverseView onClose={() => setIsUniverseViewOpen(false)} />
      )}
      {isSignalFlowOpen && scope === 'current' && (
        <SignalFlowView onClose={() => setIsSignalFlowOpen(false)} />
      )}

      {dmxPrintOpen &&
        createPortal(
          <div className="dmx-print-host">
            <DmxPatchPrintView
              rows={dmxSheetRows}
              productionTitle={project.title}
              sceneName={activeSetup.name ? `Scene ${activeSetup.sceneNumber || ''}: ${activeSetup.name}` : undefined}
            />
          </div>,
          document.body
        )}
    </div>
  );
};