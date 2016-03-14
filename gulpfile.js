var gulp = require('gulp');
var sourcemaps = require('gulp-sourcemaps');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var browserify = require('browserify');
var watchify = require('watchify');
var babelify = require('babelify');
var webserver = require('gulp-webserver');

function compile(watch) {
  var bundler = watchify(browserify('./html/js/roadmap.js', { debug: true }).transform(babelify, {presets: ["es2015"]}));

  function rebundle() {
    bundler.bundle()
      .on('error', function(err) { console.error(err); this.emit('end'); })
      .pipe(source('bundle.js'))
      .pipe(buffer())
      .pipe(sourcemaps.init({ loadMaps: true }))
      .pipe(sourcemaps.write('./'))
      .pipe(gulp.dest('./html/js'));
  }

  if (watch) {
    bundler.on('update', function() {
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
    gulp.src('.')
        .pipe(webserver({ livereload: true, port: 8081 }));
}

gulp.task('build', function() { return compile(); });
gulp.task('serve', function() { return serve(); });
gulp.task('watch', function() { return watch(); });

gulp.task('default', ['serve', 'watch']);
