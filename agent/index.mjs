#!/usr/bin/env node
/**
 * OneClaw Agent - Instance Monitor & Management
 * 
 * Runs alongside the OpenClaw gateway to:
 * 1. Send heartbeat to OneClaw server every 5 minutes
 * 2. Report gateway health status
 * 3. Receive and execute management commands
 * 4. Auto-restart gateway if it becomes unresponsive
 */

import { spawn } from 'child_process';
import { readFile, readdir, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { createServer } from 'http';

// Configuration
const ONECLAW_API = process.env.ONECLAW_API_URL || 'https://www.oneclaw.net/api';
const INSTANCE_ID = process.env.ONECLAW_INSTANCE_ID;
const INSTANCE_SECRET = process.env.ONECLAW_INSTANCE_SECRET;
const GATEWAY_PORT = process.env.PORT || 18789;
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const HEALTH_CHECK_INTERVAL = 60 * 1000; // 1 minute
const WORKSPACE_PATH = process.env.OPENCLAW_WORKSPACE || '/app/workspace';
const AGENT_PORT = process.env.AGENT_PORT || 18790;

let gatewayProcess = null;
let gatewayHealthy = false;
let lastHeartbeat = null;
let failedHealthChecks = 0;
const MAX_FAILED_CHECKS = 3;

// --- Gateway Management ---

function startGateway() {
  console.log('[Agent] Starting OpenClaw gateway...');
  
  gatewayProcess = spawn('node', [
    'node_modules/openclaw/openclaw.mjs',
    'gateway',
    '--port', String(GATEWAY_PORT),
    '--bind', '0.0.0.0'
  ], {
    stdio: 'inherit',
    env: process.env,
  });

  gatewayProcess.on('exit', (code) => {
    console.log(`[Agent] Gateway exited with code ${code}`);
    gatewayHealthy = false;
    
    // Auto-restart after 5 seconds
    setTimeout(() => {
      console.log('[Agent] Auto-restarting gateway...');
      startGateway();
      reportEvent('gateway_restarted', { exitCode: code, reason: 'auto_restart' });
    }, 5000);
  });

  gatewayProcess.on('error', (err) => {
    console.error('[Agent] Gateway error:', err);
    gatewayHealthy = false;
  });
}

async function restartGateway(reason = 'manual') {
  console.log(`[Agent] Restarting gateway (reason: ${reason})...`);
  
  if (gatewayProcess) {
    gatewayProcess.kill('SIGTERM');
    
    // Force kill after 10 seconds
    setTimeout(() => {
      if (gatewayProcess && !gatewayProcess.killed) {
        gatewayProcess.kill('SIGKILL');
      }
    }, 10000);
  }
  
  // Gateway will auto-restart via exit handler
  reportEvent('gateway_restarted', { reason });
}

// --- Health Checks ---

async function checkGatewayHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      gatewayHealthy = true;
      failedHealthChecks = 0;
      return true;
    }
  } catch (err) {
    // Ignore abort errors from timeout
  }
  
  failedHealthChecks++;
  gatewayHealthy = false;
  
  console.log(`[Agent] Health check failed (${failedHealthChecks}/${MAX_FAILED_CHECKS})`);
  
  if (failedHealthChecks >= MAX_FAILED_CHECKS) {
    console.log('[Agent] Gateway unresponsive, restarting...');
    await restartGateway('health_check_failed');
    failedHealthChecks = 0;
  }
  
  return false;
}

// --- Heartbeat & Reporting ---

async function sendHeartbeat() {
  if (!INSTANCE_ID || !INSTANCE_SECRET) {
    console.log('[Agent] No instance credentials, skipping heartbeat');
    return;
  }

  try {
    const payload = {
      instanceId: INSTANCE_ID,
      timestamp: new Date().toISOString(),
      status: gatewayHealthy ? 'healthy' : 'unhealthy',
      metrics: await collectMetrics(),
      skills: await getSkillsList(),
      memoryFiles: await getMemoryFilesList(),
    };

    const response = await fetch(`${ONECLAW_API}/agent/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INSTANCE_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      lastHeartbeat = new Date();
      const data = await response.json();
      
      // Process any commands from server
      if (data.commands && data.commands.length > 0) {
        for (const cmd of data.commands) {
          await executeCommand(cmd);
        }
      }
    } else {
      console.error('[Agent] Heartbeat failed:', response.status);
    }
  } catch (err) {
    console.error('[Agent] Heartbeat error:', err.message);
  }
}

async function reportEvent(event, data = {}) {
  if (!INSTANCE_ID || !INSTANCE_SECRET) return;

  try {
    await fetch(`${ONECLAW_API}/agent/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INSTANCE_SECRET}`,
      },
      body: JSON.stringify({
        instanceId: INSTANCE_ID,
        event,
        data,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('[Agent] Event report error:', err.message);
  }
}

// --- Metrics & Info Collection ---

async function collectMetrics() {
  const memUsage = process.memoryUsage();
  
  return {
    uptime: process.uptime(),
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
    },
    gatewayHealthy,
    failedHealthChecks,
    lastHeartbeat: lastHeartbeat?.toISOString(),
  };
}

async function getSkillsList() {
  try {
    const skillsPath = join(WORKSPACE_PATH, 'skills');
    const entries = await readdir(skillsPath, { withFileTypes: true });
    
    const skills = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = join(skillsPath, entry.name, 'SKILL.md');
        try {
          const content = await readFile(skillMdPath, 'utf-8');
          // Extract description from first paragraph
          const match = content.match(/^#.*?\n\n(.+?)(?:\n\n|$)/s);
          skills.push({
            name: entry.name,
            description: match ? match[1].slice(0, 200) : '',
          });
        } catch {
          skills.push({ name: entry.name, description: '' });
        }
      }
    }
    
    return skills;
  } catch {
    return [];
  }
}

async function getMemoryFilesList() {
  try {
    const files = [];
    
    // Check MEMORY.md
    try {
      const memoryPath = join(WORKSPACE_PATH, 'MEMORY.md');
      const stats = await stat(memoryPath);
      files.push({
        path: 'MEMORY.md',
        size: stats.size,
        modified: stats.mtime.toISOString(),
      });
    } catch {}
    
    // Check memory directory
    try {
      const memoryDir = join(WORKSPACE_PATH, 'memory');
      const entries = await readdir(memoryDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = join(memoryDir, entry.name);
          const stats = await stat(filePath);
          files.push({
            path: `memory/${entry.name}`,
            size: stats.size,
            modified: stats.mtime.toISOString(),
          });
        }
      }
    } catch {}
    
    return files;
  } catch {
    return [];
  }
}

// --- Command Execution ---

async function executeCommand(cmd) {
  console.log('[Agent] Executing command:', cmd.type);
  
  switch (cmd.type) {
    case 'restart':
      await restartGateway('server_command');
      break;
      
    case 'get_config':
      // Return current configuration
      return await getConfig();
      
    case 'update_config':
      await updateConfig(cmd.config);
      break;
      
    case 'get_memory_file':
      return await getMemoryFile(cmd.path);
      
    case 'get_logs':
      return await getRecentLogs(cmd.lines || 100);
      
    default:
      console.log('[Agent] Unknown command:', cmd.type);
  }
}

async function getConfig() {
  try {
    const configPath = join(WORKSPACE_PATH, 'config.yaml');
    const content = await readFile(configPath, 'utf-8');
    return { success: true, content };
  } catch {
    return { success: false, error: 'Config not found' };
  }
}

async function updateConfig(newConfig) {
  try {
    const configPath = join(WORKSPACE_PATH, 'config.yaml');
    await writeFile(configPath, newConfig, 'utf-8');
    
    // Restart gateway to apply changes
    await restartGateway('config_update');
    
    reportEvent('config_updated', {});
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getMemoryFile(path) {
  try {
    // Security: only allow files in workspace
    const fullPath = join(WORKSPACE_PATH, path);
    if (!fullPath.startsWith(WORKSPACE_PATH)) {
      return { success: false, error: 'Invalid path' };
    }
    
    const content = await readFile(fullPath, 'utf-8');
    return { success: true, content };
  } catch {
    return { success: false, error: 'File not found' };
  }
}

async function getRecentLogs(lines = 100) {
  // In a real implementation, this would read from a log file
  // For now, return a placeholder
  return { success: true, logs: [] };
}

// --- Agent HTTP Server (for direct commands) ---

function startAgentServer() {
  const server = createServer(async (req, res) => {
    // Verify authorization
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${INSTANCE_SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: gatewayHealthy ? 'healthy' : 'unhealthy',
        uptime: process.uptime(),
        lastHeartbeat: lastHeartbeat?.toISOString(),
      }));
      return;
    }

    if (req.method === 'POST' && req.url === '/command') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const cmd = JSON.parse(body);
          const result = await executeCommand(cmd);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result || { success: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/skills') {
      const skills = await getSkillsList();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ skills }));
      return;
    }

    if (req.method === 'GET' && req.url === '/memory') {
      const files = await getMemoryFilesList();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(AGENT_PORT, '0.0.0.0', () => {
    console.log(`[Agent] Management server listening on port ${AGENT_PORT}`);
  });
}

// --- Main ---

async function main() {
  console.log('[Agent] OneClaw Agent starting...');
  console.log(`[Agent] Instance ID: ${INSTANCE_ID || 'not set'}`);
  console.log(`[Agent] Gateway port: ${GATEWAY_PORT}`);
  console.log(`[Agent] Agent port: ${AGENT_PORT}`);
  
  // Start gateway
  startGateway();
  
  // Wait for gateway to start
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Start agent HTTP server
  startAgentServer();
  
  // Start health check loop
  setInterval(checkGatewayHealth, HEALTH_CHECK_INTERVAL);
  
  // Start heartbeat loop
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  
  // Send initial heartbeat
  setTimeout(sendHeartbeat, 30000);
  
  console.log('[Agent] Agent started successfully');
}

main().catch(console.error);
