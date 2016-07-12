#!/usr/bin/env node

process.env.NODE_CONFIG_DIR = __dirname + '/config';

var Chromecast = require('./lib/chromecast');
var MediaPlayer = require('./lib/media-player');

var main = function() {
    var chromecast = new Chromecast();
    var mediaPlayer = new MediaPlayer('chromecast', chromecast);

    chromecast.connect();
};

main();
