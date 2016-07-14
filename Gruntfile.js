module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    'http-server': {
      dev: {
        runInBackground: true,
        root: '.',
        port: 8080,
      }
    },

    copy: {
      bootstrap: {
        expand: true,
        cwd: "node_modules/@polymer/platinum-sw/bootstrap",
        src: ["*.js"],
        dest: "./bootstrap/",
      },
      "sw-toolbox": {
        expand: true,
        cwd: "node_modules/sw-toolbox",
        src: ["*.js", "*.json"],
        dest: "./sw-toolbox",
      }
    },

    vulcanize: {
      default: {
        options: { csp: 'index.js', inlineScripts: true },
        files: {'index.html': 'main.html'},
      },
    },

    watch: {
      scripts: {
        files: ['**/*.js', '!**/node_modules/*', '!index.js', '!Gruntfile.js'],
        tasks: 'vulcanize',
      },

      html: {
        files: ['**/*.html', '!**/node_modules/*', '!index.html', '!Gruntfile.js'],
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
