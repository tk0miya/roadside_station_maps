import * as esbuild from 'esbuild';

// Common configuration
const config: esbuild.BuildOptions = {
    entryPoints: ['src/frontend/app.tsx'],
    bundle: true,
    outfile: 'html/js/bundle.js',
    platform: 'browser',
    target: ['es2015'],
    loader: {
        '.js': 'jsx',
        '.jsx': 'jsx',
        '.ts': 'tsx',
        '.tsx': 'tsx',
    },
    jsx: 'automatic',
    sourcemap: true,
    minify: true,
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
};

// Build function
const build = (): Promise<esbuild.BuildResult> => {
    return esbuild.build(config);
};

// Watch function
const watch = (): Promise<void> => {
    return esbuild.context(config).then((ctx) => {
        console.log('👀 Watching for changes...');
        return ctx.watch();
    });
};

// Serve function (development server)
const serve = (): Promise<esbuild.ServeResult> => {
    return esbuild
        .context({
            ...config,
            banner: {
                js: '(() => { new EventSource("/esbuild").addEventListener("change", () => location.reload()) })()',
            },
        })
        .then((ctx) => {
            return ctx.serve({
                servedir: '.',
                port: 8081,
            });
        });
};

export { build, watch, serve, config };

// CLI handling
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--watch')) {
        watch().catch(console.error);
    } else if (args.includes('--serve')) {
        serve().then(result => {
            console.log(`Server at http://localhost:${result.port}`);
        }).catch(console.error);
    } else {
        build().catch(console.error);
    }
}
