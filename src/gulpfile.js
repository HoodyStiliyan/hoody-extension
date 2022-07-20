const fs = require('fs')
const gulp = require('gulp')
const concat = require('gulp-concat')
const minify = require('gulp-minify')
const header = require('gulp-header')
const footer = require('gulp-footer')

gulp.task('compile', () => 
    gulp.src(['./dev/*.js'])
        .pipe(concat('payload.js'))
        .pipe(minify())
        .pipe(header(`spoofBrowser = settings => {`))
        .pipe(footer(`}`))
        .pipe(gulp.dest('./dest/'))
)

gulp.task('build', gulp.series('compile', function(done) {
    // copy the file to the proxy server for data URI iframe handling
    fs.copyFileSync('./dest/payload-min.js', '/home/kushev/HoodyLocalProxy/payload-min.js')
    done()
}))