export const fallbackGuide = {
  name: 'fallback',
  description: 'Documented fallback for environments without enforceable agent completion hooks',

  instructions: `
# Fallback Execution Guide for Environments Without Enforceable Hooks

When running in an environment or coding agent that does not support lifecycle hooks (or where hooks cannot enforce exit codes):

1. **Direct CLI Execution at Task Completion**:
   Run the audit directly after completing code changes:
   \`\`\`bash
   agent-quality audit
   \`\`\`

2. **Auditing Only Modified Routes**:
   To save time during rapid iterative cycles:
   \`\`\`bash
   agent-quality audit --changed
   \`\`\`

3. **Git Pre-commit Hook**:
   Add this to \`.git/hooks/pre-commit\` (or your husky/lefthook config):
   \`\`\`bash
   #!/bin/sh
   exec agent-quality audit --changed
   \`\`\`

4. **CI Pipeline Integration (GitHub Actions)**:
   \`\`\`yaml
   - name: Run Agent Quality Gate
     run: |
       npm install -g agent-quality
       agent-quality audit --all-routes
   \`\`\`
`
};
