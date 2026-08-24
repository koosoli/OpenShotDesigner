import { describeSceneUsage, isMasterEquipmentItem } from '../domain/equipment';
import { SceneSetup } from '../types';
import {
  deriveAllScenesEquipment,
  deriveSceneEquipment,
  getCategoryMeta,
} from './equipmentList';
import { downloadCsv, safeFileName } from './download';

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
    const masterItem = isMasterEquipmentItem(item) ? item : null;

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
            describeSceneUsage(masterItem, { times: 'x' }).join('; '),
            String(masterItem.maxConcurrentQuantity),
          ]
        : [activeSetup.sceneNumber || '1', activeSetup.name]),
    ];

    rows.push(row);

    // Export nested package items (batteries, cards, monitor, follow focus, etc.)
    if (item.packageItems && item.packageItems.length > 0) {
      item.packageItems.forEach((pkgSub) => {
        const subMeta = getCategoryMeta(pkgSub.category);
        const subRow = [
          `  └─ ${subMeta.label}`,
          `  └─ [Package Item] ${pkgSub.name}`,
          pkgSub.brand || '',
          pkgSub.model || '',
          String(pkgSub.quantity),
          pkgSub.roleOrFunction || '',
          pkgSub.specs || '',
          `Part of ${item.name}`,
          ...(isAll ? ['', ''] : [activeSetup.sceneNumber || '1', activeSetup.name]),
        ];
        rows.push(subRow);
      });
    }
  });

  const csvContent = rows
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\r\n');

  const cleanProject = safeFileName(projectTitle, 'Production');
  const cleanScene = safeFileName(activeSetup.sceneNumber, '1');
  const filename = isAll
    ? `Master_Equipment_Manifest_${cleanProject}_All_Scenes.csv`
    : `Equipment_Manifest_${cleanProject}_Scene_${cleanScene}.csv`;

  // Opened in Excel, so it keeps its byte-order mark.
  downloadCsv(csvContent, filename, { excelBom: true });
};
