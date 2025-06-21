const esbuild = require('esbuild');

// Common configuration
const config = {
    entryPoints: ['html/js/app.tsx'],
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
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcemap: true,
    minify: true,
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
};

// Build function
const build = () => {
    return esbuild.build(config);
};

// Watch function
const watch = () => {
    return esbuild.context(config).then((ctx) => {
        console.log('👀 Watching for changes...');
        return ctx.watch();
    });
};

// Serve function (development server)
const serve = () => {
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

module.exports = { build, watch, serve, config };
