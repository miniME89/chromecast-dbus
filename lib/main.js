var Chromecast = require('./chromecast');
var MediaPlayer = require('./media-player');

var main = function() {
    var chromecast = new Chromecast();
    var mediaPlayer = new MediaPlayer('chromecast', chromecast);

    chromecast.connect();
};

main();
