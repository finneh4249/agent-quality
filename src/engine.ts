import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { loadConfig, AgentQualityConfig } from './config.js';
import { detectFramework } from './discovery/detector.js';
import { resolveRoutes } from './discovery/routes.js';
import { launchHeadlessChrome } from './environment/chrome.js';
import { startPreviewServer } from './environment/server.js';
import { LighthouseProvider } from './providers/lighthouse.js';
import { ArchitectureHealthProvider } from './providers/architecture/provider.js';
import { PolicyEngine } from './policy/engine.js';
import {
  AuditPlan,
  TargetPlan,
  ExecutionContext,
  NormalisedResult,
  QualityProvider,
  ProviderObservation,
  ActionableIssue
} from './types.js';
import {
  getProjectIdentifier,
  saveReport,
  saveBaseline,
  loadBaseline
} from './storage/store.js';
import {
  isRecursiveExecution,
  shouldSkipUnchanged,
  recordRunCompletion
} from './adapters/hook-guard.js';
import { getGitMetadata } from './environment/git.js';

export interface AuditOptions {
  projectRoot?: string;
  mode?: 'sample' | 'changed' | 'all';
  recordBaseline?: boolean;
  inlineConfig?: Partial<AgentQualityConfig>;
  isHookExecution?: boolean;
  agentName?: string;
}

export async function runQualityAudit(options: AuditOptions = {}): Promise<NormalisedResult> {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const projectId = getProjectIdentifier(projectRoot);
  const projectName = path.basename(projectRoot);
  const gitMeta = getGitMetadata(projectRoot);

  // 1. Guard against recursive execution
  if (isRecursiveExecution()) {
    const skippedResult: NormalisedResult = {
      schemaVersion: 'aqg.result.v1',
      timestamp: new Date().toISOString(),
      projectId,
      projectName,
      projectRoot,
      status: 'skipped_unchanged',
      reason: 'Recursive agent quality gate invocation prevented',
      plan: {
        projectId,
        projectName,
        projectRoot,
        projectType: 'non_web',
        isWeb: false,
        targets: [],
        applicableProviders: []
      },
      observations: [],
      topIssues: [],
      findings: [],
      reportPaths: {},
      environment: {
        nodeVersion: process.version,
        platform: process.platform
      }
    };
    return skippedResult;
  }

  // Set recursion guard
  process.env.AGENT_QUALITY_RUNNING = '1';

  try {
    // 2. Load configuration & policy
    const { config, policy } = await loadConfig(projectRoot, options.inlineConfig || {});
    const appDir = config.appDir ? path.resolve(projectRoot, config.appDir) : projectRoot;

    // 3. Project & Framework Discovery
    const detected = detectFramework(appDir);

    // If non-web project, return not_applicable immediately (Exit 0)
    if (!detected.isWeb || detected.type === 'non_web') {
      const naResult: NormalisedResult = {
        schemaVersion: 'aqg.result.v1',
        timestamp: new Date().toISOString(),
        projectId,
        projectName,
        projectRoot,
        status: 'not_applicable',
        reason: detected.reason || 'Non-web project: no frontend web interface or static HTML detected',
        plan: {
          projectId,
          projectName,
          projectRoot: appDir,
          projectType: 'non_web',
          isWeb: false,
          targets: [],
          applicableProviders: []
        },
        observations: [],
        topIssues: [],
        findings: [],
        reportPaths: {},
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          gitSha: gitMeta?.revision,
          gitBranch: gitMeta?.branch,
          isDirty: gitMeta?.isDirty
        }
      };
      recordRunCompletion(projectRoot, 'not_applicable');
      return naResult;
    }

    // 4. Hook Deduplication Guard: Check if working tree unchanged since last passed run
    if (options.isHookExecution && shouldSkipUnchanged(projectRoot)) {
      const skippedResult: NormalisedResult = {
        schemaVersion: 'aqg.result.v1',
        timestamp: new Date().toISOString(),
        projectId,
        projectName,
        projectRoot,
        status: 'skipped_unchanged',
        reason: 'No changes detected in working tree since the last passed audit',
        plan: {
          projectId,
          projectName,
          projectRoot: appDir,
          projectType: detected.type,
          isWeb: true,
          targets: [],
          applicableProviders: ['lighthouse']
        },
        observations: [],
        topIssues: [],
        findings: [],
        reportPaths: {},
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          gitSha: gitMeta?.revision,
          gitBranch: gitMeta?.branch,
          isDirty: gitMeta?.isDirty
        }
      };
      return skippedResult;
    }

    // 5. Route Discovery
    const outputDir = config.outputDir || detected.framework?.outputDir || 'dist';
    const discoveredRoutes = resolveRoutes({
      configRoutes: config.routes,
      sampleRoutes: config.sampleRoutes,
      excludeRoutes: config.excludeRoutes,
      projectRoot: appDir,
      outputDir,
      mode: options.mode || 'sample'
    });

    const profiles: Array<'mobile' | 'desktop'> = config.profiles || ['mobile', 'desktop'];
    const runs = config.runs || 3;

    const targets: TargetPlan[] = discoveredRoutes.map((route) => ({
      route,
      profiles,
      runs
    }));

    // 6. Build the Audit Plan
    const plan: AuditPlan = {
      projectId,
      projectName,
      projectRoot: appDir,
      projectType: detected.type,
      isWeb: true,
      previewCommand: config.previewCommand || detected.framework?.defaultPreviewCommand,
      previewUrl: config.previewUrl,
      outputDir,
      targets,
      applicableProviders: [],
      configSource: config._source
    };

    // 7. Initialize Providers
    const providers: QualityProvider[] = [
      new LighthouseProvider(),
      new ArchitectureHealthProvider(config.architecture)
    ];
    const activeProviders = providers.filter((p) => p.isApplicable(plan));
    plan.applicableProviders = activeProviders.map((p) => p.id);

    // 8. Start Preview Server & Launch Chrome (only if required by active providers)
    let serverHandle: { url: string; attached: boolean; stop: () => Promise<void> } | null = null;
    let chromeHandle: { port: number; kill: () => Promise<void> } | null = null;

    const needsServer = activeProviders.some((p) => p.getCapabilities().requiresServer !== false);
    const needsBrowser = activeProviders.some((p) => p.getCapabilities().requiresBrowser !== false);

    try {
      if (needsServer) {
        serverHandle = await startPreviewServer({
          projectRoot: appDir,
          previewCommand: plan.previewCommand,
          previewUrl: plan.previewUrl,
          defaultPort: detected.framework?.defaultPort || 4173,
          outputDir,
          env: config.env
        });
      }

      if (needsBrowser) {
        chromeHandle = await launchHeadlessChrome();
      }

      const context: ExecutionContext = {
        projectRoot: appDir,
        baseUrl: serverHandle?.url || '',
        chrome: chromeHandle || { port: 0, kill: async () => {} },
        tempDir: fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-')),
        auth: {
          headers: config.auth?.headers || {},
          cookies: config.auth?.cookies || []
        },
        env: config.env || {},
        timeouts: {
          serverStartMs: 30000,
          auditTimeoutMs: 60000
        }
      };

      // 9. Execute Providers
      const allObservations: ProviderObservation[] = [];
      const htmlReports: Record<string, string> = {};
      const rawJsonReports: Record<string, string> = {};
      const allIssues: ActionableIssue[] = [];
      const allFindingsList: any[] = [];

      // A. Execute project-scoped providers once
      for (const provider of activeProviders) {
        if (provider.getCapabilities().scope === 'project') {
          const projectTarget: TargetPlan = {
            route: '__architecture__',
            profiles: ['desktop'],
            runs: 1
          };
          const obsList = await provider.execute(projectTarget, context);
          for (const obs of obsList) {
            allObservations.push(obs);
            if (obs.rawArtifacts?.html) {
              htmlReports[`architecture_${obs.profile || 'default'}`] = obs.rawArtifacts.html;
            }
            if (obs.rawArtifacts?.json) {
              rawJsonReports[`architecture_${obs.profile || 'default'}`] = obs.rawArtifacts.json;
            }
            if (obs.issues) {
              allIssues.push(...obs.issues);
            }
            if (obs.findings) {
              allFindingsList.push(...obs.findings);
            }
          }
        }
      }

      // B. Execute route-scoped providers for each target
      for (const target of targets) {
        for (const provider of activeProviders) {
          if (provider.getCapabilities().scope === 'project') continue;
          const obsList = await provider.execute(target, context);
          for (const obs of obsList) {
            allObservations.push(obs);
            const key = `${target.route.replace(/[/\\?%*:|"<>]/g, '_') || 'index'}_${obs.profile || 'default'}`;
            if (obs.rawArtifacts?.html) {
              htmlReports[key] = obs.rawArtifacts.html;
            }
            if (obs.rawArtifacts?.json) {
              rawJsonReports[key] = obs.rawArtifacts.json;
            }
            if (obs.issues) {
              allIssues.push(...obs.issues);
            }
            if (obs.findings) {
              allFindingsList.push(...obs.findings);
            }
          }
        }
      }

      // Deduplicate issues and findings
      const issueMap = new Map<string, ActionableIssue>();
      for (const issue of allIssues) {
        if (!issueMap.has(issue.id) || issueMap.get(issue.id)!.score > issue.score) {
          issueMap.set(issue.id, issue);
        }
      }
      const topIssues = Array.from(issueMap.values()).slice(0, 5);

      const findingMap = new Map<string, any>();
      for (const finding of allFindingsList) {
        if (!findingMap.has(finding.id) || (findingMap.get(finding.id).score || 0) > (finding.score || 0)) {
          findingMap.set(finding.id, finding);
        }
      }
      const topFindings = Array.from(findingMap.values()).slice(0, 8);

      // 10. Load Baseline if present or requested
      let baselinePath: string | null = null;
      const storedBaseline = loadBaseline(projectId);

      // 11. Policy Evaluation
      const policyEngine = new PolicyEngine(policy);
      const evaluation = policyEngine.evaluate(allObservations, storedBaseline?.observations || []);

      // If user requested `agent-quality baseline`, save current as baseline
      if (options.recordBaseline) {
        baselinePath = saveBaseline(projectId, {
          projectId,
          projectName,
          projectRoot: appDir,
          observations: allObservations,
          plan
        });
      }

      // 12. Save Reports externally in ~/.agent-quality/reports/
      const reportPaths = saveReport(
        projectId,
        {
          schemaVersion: 'aqg.result.v1',
          timestamp: new Date().toISOString(),
          projectId,
          projectName,
          projectRoot: appDir,
          plan,
          status: evaluation.status,
          evaluation,
          topIssues,
          findings: topFindings,
          observations: allObservations
        },
        htmlReports,
        rawJsonReports
      );

      const normalisedResult: NormalisedResult = {
        schemaVersion: 'aqg.result.v1',
        timestamp: new Date().toISOString(),
        projectId,
        projectName,
        projectRoot: appDir,
        status: evaluation.status,
        plan,
        observations: allObservations,
        evaluation,
        topIssues,
        findings: topFindings,
        reportPaths,
        baselinePath: baselinePath || (storedBaseline ? path.join(os.homedir(), '.agent-quality', 'baselines', `${projectId}.json`) : null),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          gitSha: gitMeta?.revision,
          gitBranch: gitMeta?.branch,
          isDirty: gitMeta?.isDirty
        }
      };

      // Record run state for hook deduplication
      recordRunCompletion(projectRoot, evaluation.status, {
        passed: evaluation.passed,
        failuresCount: evaluation.failures.length,
        warningsCount: evaluation.warnings.length
      });

      return normalisedResult;
    } finally {
      if (chromeHandle) {
        await chromeHandle.kill();
      }
      if (serverHandle) {
        await serverHandle.stop();
      }
    }
  } catch (err: any) {
    const errorResult: NormalisedResult = {
      schemaVersion: 'aqg.result.v1',
      timestamp: new Date().toISOString(),
      projectId,
      projectName,
      projectRoot,
      status: 'execution_failure',
      reason: err.message || String(err),
      plan: {
        projectId,
        projectName,
        projectRoot,
        projectType: 'generic_web',
        isWeb: true,
        targets: [],
        applicableProviders: ['lighthouse']
      },
      observations: [],
      topIssues: [],
      findings: [],
      reportPaths: {},
      environment: {
        nodeVersion: process.version,
        platform: process.platform
      }
    };
    return errorResult;
  } finally {
    delete process.env.AGENT_QUALITY_RUNNING;
  }
}
