export const claudeAdapter = {
  name: 'claude',
  description: 'Claude Code completion hook adapter (Stop lifecycle event)',
  
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
                  command: `${binaryPath} hook claude`,
                  timeout: 180,
                  statusMessage: 'Running agent quality gate'
                }
              ]
            }
          ]
        }
      },
      configFile: '~/.claude/settings.json'
    };
  },

  resolveProjectRoot(env = process.env) {
    return env.CLAUDE_PROJECT_DIR || env.PWD || process.cwd();
  }
};
