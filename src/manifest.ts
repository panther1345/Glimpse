const manifest = {
  manifest_version: 3,
  name: 'Glimpse – Ask about any screenshot',
  short_name: 'Glimpse',
  version: '0.2.0',
  description: 'Answers about selected text and screenshots in an in-page popup card or side panel chat, using your own AI key.',
  icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
  action: { default_title: 'Open Glimpse', default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' } },
  background: { service_worker: 'sw.js', type: 'module' },
  side_panel: { default_path: 'sidepanel.html' },
  options_page: 'options.html',
  permissions: ['sidePanel', 'activeTab', 'scripting', 'storage', 'contextMenus', 'tabCapture'],
  host_permissions: [...(process.env.GLIMPSE_QA ? ['<all_urls>'] : []), 'https://api.openai.com/*', 'https://api.anthropic.com/*', 'https://generativelanguage.googleapis.com/*'],
  optional_host_permissions: ['<all_urls>', 'http://*/*', 'https://*/*'],
  content_scripts: [{ matches: ['<all_urls>'], js: ['content/launcher.js', 'content/selection.js', 'content/popup.js'], run_at: 'document_idle' }],
  commands: {
    'capture-region': { suggested_key: { default: 'Alt+Shift+S' }, description: 'Screenshot a region and ask' },
    'capture-tab': { suggested_key: { default: 'Alt+Shift+F' }, description: 'Screenshot the visible tab and ask' },
    _execute_action: { suggested_key: { default: 'Alt+Shift+G' }, description: 'Open Glimpse' },
  },
  web_accessible_resources: [{ resources: ['icons/*'], matches: ['<all_urls>'] }],
};
export default manifest;
