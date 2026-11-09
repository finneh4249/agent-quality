export const codexAdapter = {
  name: 'codex',
  description: 'Codex completion hook adapter (Stop lifecycle event)',

  getHookConfiguration(binaryPath = 'agent-quality') {
    return {
      hookType: 'Stop',
      configSnippet: {
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: `${binaryPath} hook codex`,
                  timeout: 180
                }
              ]
            }
          ]
        }
      },
      configFile: '~/.codex/hooks.json',
      enforcementLevel: 'blocking'
    };
  },

  resolveProjectRoot(env = process.env): string {
    return env.CODEX_PROJECT_DIR || env.PWD || process.cwd();
  }
};
