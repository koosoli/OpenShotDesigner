import { SceneSetup } from '../types';
import {
  deriveAllScenesEquipment,
  deriveSceneEquipment,
  getCategoryMeta,
} from './equipmentList';

/**
 * Escapes a field for CSV (wraps in quotes if it contains commas, newlines, or quotes).
 */
const escapeCsvField = (field: string | number | undefined | null): string => {
  if (field === undefined || field === null) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Exports current scene or all scenes master equipment manifest as an Excel-compatible CSV file.
 */
export const exportEquipmentToCsv = (
  activeSetup: SceneSetup,
  projectTitle: string,
  scope: 'current' | 'all' = 'current',
  allSetups: SceneSetup[] = [activeSetup]
) => {
  const isAll = scope === 'all';
  const items = isAll
    ? deriveAllScenesEquipment(allSetups)
    : deriveSceneEquipment(activeSetup);

  const headers = [
    'Department / Rubric',
    'Item Name',
    'Brand / Manufacturer',
    'Model / Variant',
    'Quantity',
    'Role / Function',
    'Technical Specs',
    'Origin',
    ...(isAll ? ['Used In Scenes', 'Peak Concurrent Quantity'] : ['Scene Number', 'Scene Name']),
  ];

  const rows: string[][] = [];

  // Production header metadata
  rows.push([`# Production: ${projectTitle}`]);
  rows.push([
    `# Scope: ${
      isAll
        ? `Master Equipment Package (${allSetups.length} Scenes)`
        : `Scene ${activeSetup.sceneNumber || '1'} (${activeSetup.name})`
    }`,
  ]);
  rows.push([`# Generated: ${new Date().toLocaleString()}`]);
  rows.push([]); // Empty spacer row

  // CSV Data Headers
  rows.push(headers);

  // Data rows
  items.forEach((item) => {
    const meta = getCategoryMeta(item.category);
    const isMaster = 'usedInSetups' in item;
    const masterItem = isMaster ? (item as any) : null;

    const row = [
      meta.label,
      item.name,
      item.brand || '',
      item.model || '',
      String(item.quantity),
      item.roleOrFunction || '',
      item.specs || '',
      item.isCustom ? 'Custom Item' : 'Canvas Element',
      ...(isAll && masterItem
        ? [
            masterItem.usedInSetups
              .map((s: any) => (s.sceneNumber ? `Scene ${s.sceneNumber} (x${s.quantity})` : `${s.name} (x${s.quantity})`))
              .join('; '),
            String(masterItem.maxConcurrentQuantity),
          ]
        : [activeSetup.sceneNumber || '1', activeSetup.name]),
    ];

    rows.push(row);
  });

  const csvContent = rows
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\r\n');

  // UTF-8 BOM for Microsoft Excel auto-encoding compatibility
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const cleanProject = projectTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanScene = (activeSetup.sceneNumber || '1').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = isAll
    ? `Master_Equipment_Manifest_${cleanProject}_All_Scenes.csv`
    : `Equipment_Manifest_${cleanProject}_Scene_${cleanScene}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
