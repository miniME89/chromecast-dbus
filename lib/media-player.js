var config = require('config');
var dbus = require('dbus-native');
var equal = require('deep-equal');
var logger = require('./logger');

var namespace = 'MediaPlayer';

var MediaPlayer = function(name, player) {
    this.name = 'org.mpris.MediaPlayer2.' + name;
    this.player = player;
    this.sessionBus = dbus.sessionBus();
    this.lastSync = 0;
    this.trackId = '/com/google/chromecast/tracks/0';

    //dbus interface properties
    this.PlaybackStatus = 'Idle';
    this.LoopStatus = 'None';
    this.Rate = 1.0;
    this.Shuffle = false;
    this.Metadata = [
        [
            ['mpris:trackid', ['o', this.trackId]],
            ['mpris:length', ['x', 1]]
        ]
    ];
    this.Volume = 1.0;
    this.Position = 0;
    this.MinimumRate = 0.25;
    this.MaximumRate = 2.0;
    this.CanGoNext = false;
    this.CanGoPrevious = false;
    this.CanPlay = false;
    this.CanPause = false;
    this.CanSeek = false;
    this.CanControl = true;

    //dbus interface description
    this.description = {
        path: '/org/mpris/MediaPlayer2',
        name: 'org.mpris.MediaPlayer2.Player',
        methods: {
            Next: [],
            Previous: [],
            Pause: [],
            PlayPause: [],
            Stop: [],
            Play: [],
            Seek: ['x'],
            SetPosition: ['ox'],
            OpenUri: ['s']
        },
        signals: {
            Seeked: ['x']
        },
        properties: {
            PlaybackStatus: 's',
            LoopStatus: 's',
            Rate: 'd',
            Shuffle: 'b',
            Metadata: 'a{sv}',
            Volume: 'd',
            Position: 'x',
            MinimumRate: 'd',
            MaximumRate: 'd',
            CanGoNext: 'b',
            CanGoPrevious: 'b',
            CanPlay: 'b',
            CanPause: 'b',
            CanSeek: 'b',
            CanControl: 'b'
        }
    };

    this.sessionBus.exportInterface(this, this.description.path, this.description);

    this.player.on('start', function() {
        this.start();
    }.bind(this));

    this.player.on('stop', function() {
        this.stop();
    }.bind(this));

    this.player.on('status', this.update.bind(this));
};

MediaPlayer.prototype.Next = function() {
    logger.info('[%s] received dbus call: path=`%s` interface=`%s` method=`Next`', namespace, this.description.path, this.description.name);

    if (!this.supports('next')) {
        logger.warn('[%s] `next` is not supported by player', namespace);
        return;
    }

    this.player.next();
};

MediaPlayer.prototype.Previous = function() {
    logger.info('[%s] received dbus call: path=`%s` interface=`%s` method=`Previous`', namespace, this.description.path, this.description.name);

    if (!this.supports('previous')) {
        logger.warn('[%s] `previous` is not supported by player', namespace);
        return;
    }

    this.player.previous();
};

MediaPlayer.prototype.Pause = function() {
    logger.info('[%s] received dbus call: path=`%s` interface=`%s` method=`Pause`', namespace, this.description.path, this.description.name);

    if (!this.supports('previous')) {
        logger.warn('[%s] `pause` is not supported by player', namespace);
        return;
    }

    this.player.pause();
};

MediaPlayer.prototype.PlayPause = function() {
    logger.info('[%s] received dbus call: path=`%s` interface=`%s` method=`PlayPause`', namespace, this.description.path, this.description.name);

    if (!this.supports('play')) {
        logger.warn('[%s] `play` is not supported by player', namespace);
        return;
    }

    if (!this.supports('pause')) {
        logger.warn('[%s] `pause` is not supported by player', namespace);
        return;
    }

    if (this.CanPlay) {
        this.player.pause();
    } else {
        this.player.play();
    }
};

MediaPlayer.prototype.Stop = function() {
    logger.info('[%s] received dbus call: path=`%s` interface=`%s` method=`Stop`', namespace, this.description.path, this.description.name);

    if (!this.supports('stop')) {
        logger.warn('[%s] `stop` is not supported by player', namespace);
        return;
    }

    this.player.stop();
};

MediaPlayer.prototype.Play = function() {
    logger.info('[%s] received dbus call: path=`%s` interface=`%s` method=`Play`', namespace, this.description.path, this.description.name);

    if (!this.supports('play')) {
        logger.warn('[%s] `play` is not supported by player', namespace);
        return;
    }

    this.player.play();
};

MediaPlayer.prototype.Seek = function(position) {
    logger.info('[%s] received dbus call: path=`%s` interface=`%s` method=`Seek` parameters=[%s]', namespace, this.description.path, this.description.name, position);

    if (!this.supports('seek')) {
        logger.warn('[%s] `seek` is not supported by player', namespace);
        return;
    }

    this.player.seek(position);
};

MediaPlayer.prototype.SetPosition = function(trackId, position) {
    logger.info('[%s] received dbus call: path=`%s` interface=`%s` method=`SetPosition` parameters=[%s, %s]', namespace, this.description.path, this.description.name, trackId, position);

    if (!this.supports('seek')) {
        logger.warn('[%s] `seek` is not supported by player', namespace);
        return;
    }

    this.player.seek(position);
};

MediaPlayer.prototype.OpenUri = function(uri) {
    logger.info('[%s] received dbus call: path=`%s` interface=`%s` method=`OpenUri` parameters=[%s]', namespace, this.description.path, this.description.name, uri);

    if (!this.supports('open')) {
        logger.warn('[%s] `open` is not supported by player', namespace);
        return;
    }

    this.player.open(uri);
};

MediaPlayer.prototype.emit = function(name) {
    var args = Array.prototype.slice.call(arguments, 1).join(', ');
    logger.info('[%s] emit dbus signal: path=`%s` interface=`%s` signal=`%s` parameters=[%s]', namespace, this.description.path, this.description.name, name, args);
};

MediaPlayer.prototype.getProperty = function(name) {
    var signature = this.description.properties[name];
    if (typeof signature !== 'string') {
        throw new Error('`' + name + '` is not a property');
    }

    return this[name];
};

MediaPlayer.prototype.setProperty = function(name, value, notify) {
    var properties = {};
    properties[name] = value;
    this.setProperties(properties, notify);
};

MediaPlayer.prototype.setProperties = function(properties, notify) {
    if (typeof notify !== 'boolean') {
        notify = true;
    }

    var changedProperties = [];
    for (var name in properties) {
        var value = properties[name];
        var oldValue = this.getProperty(name);
        if (!equal(value, oldValue)) {
            var signature = this.description.properties[name];
            changedProperties.push({
                name: name,
                value: value,
                signature: signature
            });
        }
    }

    if (changedProperties.length > 0) {
        var dbusValue = [];
        for (var i = 0; i < changedProperties.length; i++) {
            var property = changedProperties[i];

            this[property.name] = property.value;
            dbusValue.push([property.name, [property.signature, property.value]]);
        }

        if (notify) {
            this.sessionBus.sendSignal(this.description.path, 'org.freedesktop.DBus.Properties', 'PropertiesChanged', 'sa{sv}as', [
                this.description.name, dbusValue, []
            ]);
        }
    }
};

MediaPlayer.prototype.supports = function(name) {
    return typeof this.player[name] === "function";
};

MediaPlayer.prototype.update = function(status) {
    var properties = {};

    properties.Rate = status.playbackRate || 1.0;

    if (status.volume) {
        properties.Volume = status.volume.level || 1.0;
    }

    if (status.media) {
        properties.Metadata = [
            [
                ['mpris:trackid', ['o', this.trackId]],
                ['mpris:length', ['x', status.media.duration * 1000000 || 0]]
            ]
        ];
        properties.CanSeek = true;
    } else {
        properties.Metadata = [
            []
        ];
        properties.CanSeek = false;
    }

    if (status.playerState === 'PLAYING') {
        properties.PlaybackStatus = 'Playing';
        properties.CanPlay = true;
        properties.CanPause = false;
    } else if (status.playerState === 'PAUSED') {
        properties.PlaybackStatus = 'Paused';
        properties.CanPlay = false;
        properties.CanPause = true;
    } else if (status.playerState === 'BUFFERING') {
        properties.PlaybackStatus = 'Buffering';
        properties.CanPlay = true;
        properties.CanPause = false;
    } else {
        properties.PlaybackStatus = 'Idle';
        properties.CanPlay = false;
        properties.CanPause = false;
    }

    var currentTimeMs = status.currentTime * 1000 || 0;
    var currentTimeUs = currentTimeMs * 1000 || 0;

    this.setProperties(properties);
    this.setProperty('Position', currentTimeUs, false);

    //emit `Seeked` signal if unexpected `currentTime` drift
    var now = Date.now();
    var drift = Math.abs((now - this.lastSync) - currentTimeMs);
    if (drift > 500 && this.CanPlay) {
        this.emit('Seeked', currentTimeUs);
        this.lastSync = now - currentTimeMs;
    }
};

MediaPlayer.prototype.start = function() {
    this.sessionBus.requestName(this.name, 0);
};

MediaPlayer.prototype.stop = function() {
    this.sessionBus.releaseName(this.name, 0);
};

module.exports = MediaPlayer;
