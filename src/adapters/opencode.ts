export const openCodeAdapter = {
  name: 'opencode',
  description: 'OpenCode completion hook adapter (session.idle event plugin)',

  getHookConfiguration(binaryPath = 'agent-quality') {
    return {
      hookType: 'plugin:session.idle',
      pluginFile: '~/.config/opencode/plugins/agent-quality.js',
      pluginTemplate: `// agent-quality OpenCode integration
import { exec } from "node:child_process";

export default {
  id: "agent-quality",
  setup: async () => {},
  server: async () => {
    return {
      event: async ({ event }) => {
        if (event && event.type === "session.idle") {
          exec("${binaryPath} hook opencode", (err, stdout, stderr) => {
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);
          });
        }
      }
    };
  }
};
`,
      enforcementLevel: 'advisory'
    };
  },

  resolveProjectRoot(env = process.env): string {
    return env.OPENCODE_PROJECT_DIR || env.PWD || process.cwd();
  }
};
