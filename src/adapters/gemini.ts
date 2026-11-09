export const geminiAdapter = {
  name: 'gemini',
  description: 'Gemini CLI completion hook adapter (AfterAgent lifecycle event)',

  getHookConfiguration(binaryPath = 'agent-quality') {
    return {
      hookType: 'AfterAgent',
      configSnippet: {
        hooks: {
          AfterAgent: [
            {
              hooks: [
                {
                  type: 'command',
                  command: `${binaryPath} hook gemini`,
                  timeout: 180000
                }
              ]
            }
          ]
        }
      },
      configFile: '~/.gemini/settings.json',
      enforcementLevel: 'advisory'
    };
  },

  resolveProjectRoot(env = process.env): string {
    return env.GEMINI_PROJECT_DIR || env.PWD || process.cwd();
  }
};
