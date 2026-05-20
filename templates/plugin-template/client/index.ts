import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h } = React;

export function activate(api: ClientPluginAPI): void {
  // Example: register a status bar item
  // function MyStatus(): any {
  //   return h("span", { className: "text-xs text-gray-400" }, "My Plugin");
  // }
  //
  // api.ui.registerStatusBarItem(MyStatus, {
  //   id: "my-plugin-status",
  //   position: "right",
  //   order: 50,
  // });
}

export function deactivate(): void {
  // Cleanup timers, listeners, etc.
}
