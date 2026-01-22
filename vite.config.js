import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

// Get spark build timestamp from file modification time
function getSparkBuildTime() {
  try {
    const sparkPath = path.resolve(__dirname, './lib/spark.module.js');
    if (fs.existsSync(sparkPath)) {
      const stats = fs.statSync(sparkPath);
      return new Date(stats.mtime).toISOString();
    }
  } catch (e) {
    // Ignore errors
  }
  return 'unknown';
}

// Plugin to copy public/ files excluding worlds/ directory (those are on CDN)
function copyPublicExcludingWorlds() {
  return {
    name: 'copy-public-excluding-worlds',
    writeBundle() {
      const publicDir = path.resolve(__dirname, 'public');
      const distDir = path.resolve(__dirname, 'dist');
      
      // Copy files from public/ to dist/, excluding worlds/
      function copyRecursive(src, dest, relativePath = '') {
        if (!fs.existsSync(src)) return;
        
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          const relPath = path.join(relativePath, entry.name);
          
          // Skip worlds directory
          if (relPath === 'worlds' || relPath.startsWith('worlds/') || relPath.startsWith('worlds\\')) {
            continue;
          }
          
          if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath, relPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      }
      
      copyRecursive(publicDir, distDir);
      console.log('✓ Copied public/ to dist/ (excluding worlds/)');
    }
  };
}

export default defineConfig(({ command, mode }) => ({
  resolve: {
    alias: {
      // Use local spark build from lib directory (included in deployment)
      '@sparkjsdev/spark': path.resolve(__dirname, './lib/spark.module.js'),
    },
  },
  server: {
    port: 3000,
    host: true,  // Bind to all interfaces (0.0.0.0) for LAN access
    open: true,
    allowedHosts: true,  // Allow any host (needed for LAN IPs)
  },
  // Dev: serve public/ for local testing (includes worlds/)
  // Build: disable default publicDir, use plugin to copy excluding worlds/
  publicDir: command === 'serve' ? 'public' : false,
  plugins: command === 'build' ? [copyPublicExcludingWorlds()] : [],
  build: {
    // Target ES2022 to support top-level await
    target: 'es2022',
  },
  define: {
    // Inject build timestamps
    __PROTOVERSE_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __SPARK_BUILD_TIME__: JSON.stringify(getSparkBuildTime()),
    // Inject build mode for preset selection
    __PROTOVERSE_MODE__: JSON.stringify(mode),
  },
}));

