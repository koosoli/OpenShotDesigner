import { CameraElement, Project, SceneSetup, Shot } from '../types';
import { effectiveMovement } from './cameraMovement';

export function exportShotListToCsv(setup: SceneSetup, projectTitle: string): void {
  const cameras = (setup.elements || []).filter((e) => e.type === 'camera') as CameraElement[];
  const camById = new Map(cameras.map((c) => [c.id, c]));
  const headers = [
    'Scene',
    'Shot #',
    'Shot Name / Subject',
    'Camera',
    'Shot Size',
    'Lens (mm)',
    'Camera Angle',
    'Movement',
    'Status',
    'Takes',
    'Est Duration (s)',
    'Framing & Action Notes',
    'Equipment Notes',
  ];

  const rows = setup.shots.map((shot: Shot) => [
    `"${shot.sceneNumber || setup.sceneNumber || '1'}"`,
    `"${shot.shotNumber || ''}"`,
    `"${(shot.name || '').replace(/"/g, '""')}"`,
    `"${shot.cameraLabel || ''}"`,
    `"${shot.shotSize || ''}"`,
    `"${shot.lensMm ? `${shot.lensMm}mm` : ''}"`,
    `"${shot.cameraAngle || ''}"`,
    `"${effectiveMovement(shot, camById.get(shot.cameraId))}"`,
    `"${shot.status || 'planned'}"`,
    `"${shot.takesCount || 0}"`,
    `"${shot.estDurationSeconds || 0}"`,
    `"${(shot.framingDescription || '').replace(/"/g, '""')}"`,
    `"${(shot.equipmentNotes || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [
    `# Open Shot Designer Shot List - ${projectTitle} - Scene ${setup.sceneNumber || '1'} (${setup.name})`,
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `ShotList_Scene_${setup.sceneNumber || '1'}_${setup.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Exports every setup / scene in the project into a single CSV workbook. */
export function exportProjectToCsv(project: Project): void {
  const headers = [
    'Project',
    'Scene',
    'Shot #',
    'Shot Name / Subject',
    'Camera',
    'Shot Size',
    'Lens (mm)',
    'Camera Angle',
    'Movement',
    'Status',
    'Takes',
    'Est Duration (s)',
    'Framing & Action Notes',
    'Equipment Notes',
  ];

  const rows: string[] = [];
  project.setups.forEach((setup: SceneSetup) => {
    const setupCameras = (setup.elements || []).filter((e) => e.type === 'camera') as CameraElement[];
    const setupCamById = new Map(setupCameras.map((c) => [c.id, c]));
    setup.shots.forEach((shot: Shot) => {
      rows.push(
        [
          `"${project.title}"`,
          `"${setup.sceneNumber || shot.sceneNumber || '1'}"`,
          `"${shot.shotNumber || ''}"`,
          `"${(shot.name || '').replace(/"/g, '""')}"`,
          `"${shot.cameraLabel || ''}"`,
          `"${shot.shotSize || ''}"`,
          `"${shot.lensMm ? `${shot.lensMm}mm` : ''}"`,
          `"${shot.cameraAngle || ''}"`,
          `"${effectiveMovement(shot, setupCamById.get(shot.cameraId))}"`,
          `"${shot.status || 'planned'}"`,
          `"${shot.takesCount || 0}"`,
          `"${shot.estDurationSeconds || 0}"`,
          `"${(shot.framingDescription || '').replace(/"/g, '""')}"`,
          `"${(shot.equipmentNotes || '').replace(/"/g, '""')}"`,
        ].join(',')
      );
    });
  });

  const csvContent = [
    `# Open Shot Designer Full Production Shot List - ${project.title}`,
    headers.join(','),
    ...rows,
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${project.title.replace(/[^a-zA-Z0-9]/g, '_')}_Full_ShotList.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
