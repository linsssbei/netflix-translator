import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

// Chrome content scripts cannot use ES module import statements.
// This plugin inlines shared chunk code into content-script entries,
// replacing imports with IIFE-wrapped chunks that export bindings back.
function inlineContentScriptImportsPlugin(): Plugin {
  return {
    name: 'inline-content-script-imports',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !name.startsWith('content-scripts/')) continue;

        // Collect all imported chunk file names (transitively)
        const visited = new Set<string>();
        const importFilenames: string[] = [];

        function collectImports(fileName: string) {
          if (visited.has(fileName)) return;
          visited.add(fileName);
          const dep = bundle[fileName] as { type: string; imports: string[] } | undefined;
          if (!dep || dep.type !== 'chunk') return;
          for (const imp of dep.imports) {
            collectImports(imp);
          }
          importFilenames.push(fileName);
        }

        for (const imp of chunk.imports) {
          collectImports(imp);
        }

        if (importFilenames.length === 0) continue;

        // Build the replacement: for each imported chunk, create an IIFE
        // that returns its exports, then bind the imported names
        const iifeDeclarations: string[] = [];
        let chunkCounter = 0;

        for (const fn of importFilenames) {
          const dep = bundle[fn] as { type: string; code: string; exports: string[] } | undefined;
          if (!dep || dep.type !== 'chunk') continue;

          let depCode = dep.code;
          // Convert `export { I as a, E as b }` → `return { a: I, b: E }`
          // and `export { x }` → `return { x: x }`
          depCode = depCode.replace(
            /export\s*\{([^}]*)\};?/g,
            (_e: string, exports: string) => {
              const pairs = exports.split(',').map((s: string) => {
                const trimmed = s.trim();
                // Match "name as alias" where name can contain $ (valid JS identifier)
                const asMatch = trimmed.match(/^([$\w]+)\s+as\s+([$\w]+)$/);
                if (asMatch) return `${asMatch[2]}:${asMatch[1]}`;
                return `${trimmed}:${trimmed}`;
              });
              return `return {${pairs.join(',')}};`;
            }
          );
          // Convert `export default x;` → `return x;`
          depCode = depCode.replace(
            /export\s*default\s+(\w+);?/g,
            'return $1;'
          );

          const chunkVar = `__c${chunkCounter}`;
          iifeDeclarations.push(`var ${chunkVar}=(function(){${depCode}})();`);
          chunkCounter++;
        }

        // Build binding assignments from the import statements
        let code = chunk.code;

        // Map chunk filenames to their IIFE variable
        const fileToIIFE = new Map<string, string>();
        let ci = 0;
        for (const fn of importFilenames) {
          fileToIIFE.set(fn, `__c${ci}`);
          ci++;
        }

        // Process imports: replace with IIFE bindings
        for (const fn of importFilenames) {
          const dep = bundle[fn] as { type: string; exports: string[] } | undefined;
          if (!dep) continue;
          const chunkVar = fileToIIFE.get(fn)!;

          // Match import from this file — handle both "../shared/foo.js" and "./shared/foo.js"
          const escapedFn = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const fileImportRegex = new RegExp(
            `import\\s*\\{([^}]*)\\}\\s*from\\s*["']\\.\\.?\\/${escapedFn}["'];?`,
            'g'
          );

          code = code.replace(fileImportRegex, (_full, specifiers: string) => {
            const bindings: string[] = [];
            const parts = specifiers.split(',');
            for (const part of parts) {
              const trimmed = part.trim();
              if (!trimmed) continue;
              const asMatch = trimmed.match(/^([$\w]+)\s+as\s+([$\w]+)$/);
              if (asMatch) {
                bindings.push(`var ${asMatch[2]}=${chunkVar}.${asMatch[1]}`);
              } else {
                const name = trimmed.match(/^([$\w]+)$/)?.[1];
                if (name) bindings.push(`var ${name}=${chunkVar}.${name}`);
              }
            }
            return bindings.length > 0 ? `${bindings.join(';')};` : '';
          });
        }

        code = code.replace(/export\s*\{[^}]*\};?/g, '');
        code = code.replace(/export\s*default\s+\w+;?/g, '');

        chunk.code = iifeDeclarations.join('\n') + '\n' + code.trim();
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
        library: resolve(__dirname, 'library.html'),
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
