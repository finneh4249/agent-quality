import fs from 'node:fs';
import * as chromeLauncher from 'chrome-launcher';

const COMMON_CHROME_PATHS = [
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  // Windows
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

export function findChrome(): { path: string; source: string } | null {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return {
      path: process.env.CHROME_PATH,
      source: 'CHROME_PATH'
    };
  }

  try {
    const installations = chromeLauncher.Launcher.getInstallations();
    if (installations && installations.length > 0) {
      return {
        path: installations[0],
        source: 'chrome-launcher'
      };
    }
  } catch {}

  for (const candidate of COMMON_CHROME_PATHS) {
    if (fs.existsSync(candidate)) {
      return {
        path: candidate,
        source: 'common-path'
      };
    }
  }

  return null;
}

export async function launchHeadlessChrome(options: {
  chromeFlags?: string[];
  logLevel?: 'silent' | 'error' | 'info' | 'verbose';
  port?: number;
} = {}): Promise<{
  chrome: chromeLauncher.LaunchedChrome;
  port: number;
  kill: () => Promise<void>;
}> {
  const chromeInfo = findChrome();
  if (!chromeInfo) {
    throw new Error(
      'Headless Chrome not found. Please ensure Google Chrome or Chromium is installed, or set the CHROME_PATH environment variable.'
    );
  }

  const chromeFlags = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-software-rasterizer',
    '--mute-audio',
    ...(options.chromeFlags || [])
  ];

  const chrome = await chromeLauncher.launch({
    chromePath: chromeInfo.path,
    chromeFlags,
    logLevel: options.logLevel || 'silent',
    port: options.port || 0
  });

  return {
    chrome,
    port: chrome.port,
    kill: async () => {
      try {
        await chrome.kill();
      } catch {}
    }
  };
}
