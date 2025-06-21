const gulp = require('gulp');
const sourcemaps = require('gulp-sourcemaps');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const browserify = require('browserify');
const watchify = require('watchify');
const babelify = require('babelify');
const tsify = require('tsify');
const webserver = require('gulp-webserver');

function compile(watch) {
    let bundler = browserify({
        basedir: '.',
        debug: true,
        entries: ['./html/js/app.js'],
        cache: {},
        packageCache: {},
    })
        .plugin(tsify)
        .transform(babelify, {
            presets: ['es2015', 'react'],
            extensions: ['.js', '.jsx', '.ts', '.tsx'],
        });

    if (watch) {
        bundler = watchify(bundler);
    }

    function rebundle() {
        bundler
            .bundle()
            .on('error', function (err) {
                console.error(err);
                this.emit('end');
            })
            .pipe(source('bundle.js'))
            .pipe(buffer())
            .pipe(sourcemaps.init({ loadMaps: true }))
            .pipe(sourcemaps.write('./'))
            .pipe(gulp.dest('./html/js'));
    }

    if (watch) {
        bundler.on('update', () => {
            console.log('-> bundling...');
            rebundle();
        });
    }

    rebundle();
}

function watch() {
    return compile(true);
}

function serve() {
    gulp.src('.').pipe(webserver({ port: 8081 }));
}

gulp.task('build', () => compile());
gulp.task('serve', () => serve());
gulp.task('watch', () => watch());

gulp.task('default', gulp.series('serve', 'watch'));
