const { Plugin, PluginSettingTab, SettingGroup } = require('obsidian');

const DEFAULT_SETTINGS = {
  openOnLoad: true,
  closeOnUnload: true,
  defaultTab: 'last-selected',
};

const TAB_OPTIONS = {
  'last-selected': 'Last selected',
  elements: 'Elements',
  console: 'Console',
  sources: 'Sources',
  network: 'Network',
  performance: 'Performance',
  memory: 'Memory',
  application: 'Application',
  lighthouse: 'Lighthouse',
  recorder: 'Recorder',
};

function getElectron() {
  try {
    return require('electron').remote;
  } catch {
    return null;
  }
}

function openDevToolsFor(wc, tab) {
  wc.openDevTools();
  if (tab && tab !== 'last-selected') {
    // Internal Chromium API — stable but undocumented
    setTimeout(() => {
      try {
        wc.devToolsWebContents?.executeJavaScript(
          `DevToolsAPI.showPanel("${tab}")`
        );
      } catch {
        /* DevTools not ready or API unavailable */
      }
    }, 300);
  }
}

function openDevTools(app, tab) {
  const remote = getElectron();
  if (remote) {
    openDevToolsFor(remote.getCurrentWindow().webContents, tab);
  } else {
    app.commands.executeCommandById('app:toggle-developer-tools');
  }
}

function openDevToolsAllWindows(tab) {
  const remote = getElectron();
  if (!remote) return;
  for (const bw of remote.BrowserWindow.getAllWindows()) {
    if (!bw.webContents.isDevToolsOpened()) {
      openDevToolsFor(bw.webContents, tab);
    }
  }
}

function closeDevToolsAllWindows(app) {
  const remote = getElectron();
  if (remote) {
    for (const bw of remote.BrowserWindow.getAllWindows()) {
      if (bw.webContents.isDevToolsOpened()) {
        bw.webContents.closeDevTools();
      }
    }
  } else {
    app.commands.executeCommandById('app:toggle-developer-tools');
  }
}

module.exports = class AutoDevToolsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AutoDevToolsSettingTab(this.app, this));

    this.addCommand({
      id: 'toggle',
      name: 'Toggle developer tools',
      callback: () => {
        const remote = getElectron();
        const wc = remote?.getCurrentWindow().webContents;
        if (wc?.isDevToolsOpened()) {
          closeDevToolsAllWindows(this.app);
        } else {
          openDevTools(this.app, this.settings.defaultTab);
        }
      },
    });

    for (const [id, label] of Object.entries(TAB_OPTIONS)) {
      if (id === 'last-selected') continue;
      this.addCommand({
        id: `open-${id}`,
        name: `Open ${label} tab`,
        callback: () => openDevTools(this.app, id),
      });
    }

    if (this.settings.openOnLoad) {
      this.app.workspace.onLayoutReady(() =>
        openDevTools(this.app, this.settings.defaultTab)
      );

      // Open DevTools in popout windows as they're created
      this.registerEvent(
        this.app.workspace.on('window-open', () => {
          setTimeout(
            () => openDevToolsAllWindows(this.settings.defaultTab),
            500
          );
        })
      );
    }
  }

  onunload() {
    if (this.settings.closeOnUnload) {
      closeDevToolsAllWindows(this.app);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
};

class AutoDevToolsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new SettingGroup(containerEl)
      .addSetting((s) =>
        s.setName('Open on plugin load').addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.openOnLoad)
            .onChange(async (value) => {
              this.plugin.settings.openOnLoad = value;
              await this.plugin.saveSettings();
            })
        )
      )
      .addSetting((s) =>
        s.setName('Close on plugin unload').addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.closeOnUnload)
            .onChange(async (value) => {
              this.plugin.settings.closeOnUnload = value;
              await this.plugin.saveSettings();
            })
        )
      )
      .addSetting((s) =>
        s
          .setName('Default tab')
          .setDesc(
            'Uses an internal API that may break in future Obsidian updates.'
          )
          .addDropdown((dropdown) =>
            dropdown
              .addOptions(TAB_OPTIONS)
              .setValue(this.plugin.settings.defaultTab)
              .onChange(async (value) => {
                this.plugin.settings.defaultTab = value;
                await this.plugin.saveSettings();
              })
          )
      );
  }
}
