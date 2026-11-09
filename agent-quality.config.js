// Agent Quality Gate — Self-Governance Architecture Configuration
export default {
  architecture: {
    baselineRef: "HEAD~1",

    layers: [
      {
        name: "cli",
        pattern: "src/cli.ts",
        allowedDependencies: [
          "engine",
          "reporting",
          "environment",
          "adapters",
          "storage",
          "policy",
          "config",
          "types",
          "providers"
        ]
      },
      {
        name: "engine",
        pattern: "src/engine.ts",
        allowedDependencies: [
          "discovery",
          "environment",
          "providers",
          "policy",
          "storage",
          "adapters",
          "config",
          "types"
        ]
      },
      {
        name: "providers",
        pattern: "src/providers/**",
        allowedDependencies: [
          "types",
          "config",
          "storage",
          "discovery",
          "environment"
        ]
      },
      {
        name: "policy",
        pattern: "src/policy/**",
        allowedDependencies: ["types", "config"]
      },
      {
        name: "reporting",
        pattern: "src/reporting/**",
        allowedDependencies: ["types", "policy"]
      },
      {
        name: "discovery",
        pattern: "src/discovery/**",
        allowedDependencies: ["types"]
      },
      {
        name: "environment",
        pattern: "src/environment/**",
        allowedDependencies: ["types"]
      },
      {
        name: "storage",
        pattern: "src/storage/**",
        allowedDependencies: ["types"]
      },
      {
        name: "types",
        pattern: "src/types.ts",
        allowedDependencies: []
      }
    ],

    protectedModules: [
      "src/types.ts",
      "src/config.ts",
      "package.json"
    ],

    budgets: {
      singleUseComponentGrowth: { warningThreshold: 5 },
      duplicationGrowth: { warningThreshold: 2 },
      dependencyCycleGrowth: { warningThreshold: 0 },
      dispersionGrowth: { warningThreshold: 0.35 }
    },

    exceptions: [
      {
        ruleId: "protected-module",
        target: "src/types.ts",
        reason: "Contract extensions for Architecture Health, budgets, remediation, and skills"
      },
      {
        ruleId: "protected-module",
        target: "package.json",
        reason: "Skills manifest export addition"
      }
    ]
  }
};
