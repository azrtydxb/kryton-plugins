import type { ClientPluginAPI } from '../../../types/client';


function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function activate(api: ClientPluginAPI): void {
  api.ui.registerNoteAction({
    id: 'publish-export-html',
    label: 'Export as HTML',
    icon: 'globe',
    onClick: async (notePath: string) => {
      try {
        const resp = await api.api.fetch('/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: [notePath] }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
          api.notify.error(`Export failed: ${err.error ?? resp.statusText}`);
          return;
        }

        const data = await resp.json() as { files: Array<{ path: string; content: string }> };
        if (!data.files || data.files.length === 0) {
          api.notify.error('Export returned no files');
          return;
        }

        for (const file of data.files) {
          downloadFile(file.path, file.content);
        }

        api.notify.success('Exported as HTML');
      } catch (err: any) {
        api.notify.error(`Export failed: ${err?.message ?? 'Unknown error'}`);
      }
    },
  });
}

export function deactivate(): void {
  // Cleanup is handled by the plugin system
}
