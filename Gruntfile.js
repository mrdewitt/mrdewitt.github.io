module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    'http-server': {
      dev: {
        runInBackground: true,
        root: './dist',
        port: 8080,
      }
    },

    copy: {
      bootstrap: {
        expand: true,
        cwd: "node_modules/@polymer/platinum-sw",
        src: ["bootstrap/*.js", "service-worker.js"],
        dest: "dist/",
      },
      "sw-toolbox": {
        expand: true,
        cwd: "node_modules/sw-toolbox",
        src: ["*.js", "*.json"],
        dest: "dist/sw-toolbox/",
      }
    },

    vulcanize: {
      default: {
        options: { csp: 'index.js', inlineScripts: true },
        files: {'dist/index.html': 'src/main.html'},
      },
    },

    watch: {
      scripts: {
        files: ['src/**/*.js'],
        tasks: 'vulcanize',
      },

      html: {
        files: ['src/**/*.html'],
        tasks: 'vulcanize',
      }

    },
  });


  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-http-server');
  // Load the watcher script.
  grunt.loadNpmTasks('grunt-contrib-watch');
  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks('grunt-vulcanize');

  // Default task(s).
  grunt.registerTask('default', ['copy', 'vulcanize', 'http-server:dev', 'watch']);

};
