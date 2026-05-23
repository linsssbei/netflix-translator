import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

// Chrome content scripts cannot use ES module import statements.
// This plugin inlines shared chunk code into content-script entries,
// replacing imports with the actual code.
function inlineContentScriptImportsPlugin(): Plugin {
  return {
    name: 'inline-content-script-imports',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !name.startsWith('content-scripts/')) continue;

        // Collect all imported chunk file names (transitively)
        const visited = new Set<string>();
        const inlineCode: string[] = [];
        const importFilenames: string[] = [];

        function collectImports(fileName: string) {
          if (visited.has(fileName)) return;
          visited.add(fileName);
          const dep = bundle[fileName] as { type: string; code: string; imports: string[] } | undefined;
          if (!dep || dep.type !== 'chunk') return;
          // Process transitive imports first
          for (const imp of dep.imports) {
            collectImports(imp);
          }
          importFilenames.push(fileName);
        }

        for (const imp of chunk.imports) {
          collectImports(imp);
        }

        // Build inlined code from imported chunks
        for (const fn of importFilenames) {
          const dep = bundle[fn] as { type: string; code: string };
          if (dep.type === 'chunk') {
            inlineCode.push(dep.code);
          }
        }

        if (inlineCode.length > 0) {
          let code = chunk.code;
          // Remove import lines (they may be at start or mid-line in minified output)
          code = code.replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g, '');
          // Remove export lines (chunks use named exports, not valid in non-module scripts)
          code = code.replace(/export\s*\{[^}]*\};?/g, '');
          code = code.replace(/export\s*default\s+\w+;?/g, '');

          // Prepend inlined shared code (also strip exports from inlined chunks)
          const cleanInlined = inlineCode
            .map((c) => c.replace(/export\s*\{[^}]*\};?/g, '').replace(/export\s*default\s+\w+;?/g, ''))
            .join('\n');
          chunk.code = cleanInlined + '\n' + code.trim();
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
  plugins: [inlineContentScriptImportsPlugin()],
});
