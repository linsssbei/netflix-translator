import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

// Rollup plugin to move import statements to the top of output chunks.
// TypeScript helpers can end up before imports in the Rollup output,
// which breaks ES modules in Chrome content scripts.
function hoistImportsPlugin(): Plugin {
  return {
    name: 'hoist-imports',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const code = chunk.code;
        // Match import statements anywhere in the chunk (they may be mid-line)
        const importRegex = /import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g;
        const imports: string[] = [];
        let rest = code;
        let match;
        while ((match = importRegex.exec(code)) !== null) {
          imports.push(match[0] + ';');
        }
        if (imports.length > 0 && name.startsWith('content-scripts/')) {
          rest = code.replace(importRegex, '').trim();
          // Strip leading var statements that may have introduced semicolons
          rest = rest.replace(/^;/, '').trim();
          chunk.code = imports.join('\n') + '\n' + rest;
        }
      }
    },
  };
}

export default defineConfig({
  base: '',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/service-worker.ts'),
        'content-scripts/netflix': resolve(__dirname, 'src/content-scripts/netflix.ts'),
        popup: resolve(__dirname, 'popup.html'),
        options: resolve(__dirname, 'options.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'shared/[name].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name ? assetInfo.name.split('.') : [];
          const ext = info[info.length - 1];
          if (ext === 'css') {
            return 'styles/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [hoistImportsPlugin()],
});
