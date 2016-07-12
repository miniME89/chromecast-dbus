var config = require('config');
var EventEmitter2 = require('eventemitter2').EventEmitter2;
var inherits = require('util').inherits;
var machina = require('machina');
var Client = require('castv2-client').Client;
var DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;
var mdns = require('mdns');
var logger = require('./logger');

var namespace = 'Chromecast';

var Chromecast = function() {
    EventEmitter2.call(this, { wildcard: true });

    this.fsm = new machina.Fsm({
        namespace: 'chromecast',
        initialState: 'idle',
        states: this.states
    });

    this.fsm.on('transition', function(data) {
        logger.debug('[%s] transition from `%s` to `%s`', namespace, data.fromState, data.toState);
    });

    this.fsm.on('handling', function(data) {
        logger.debug('[%s] handling `%s`', namespace, data.inputType);
    });

    this.fsm.on('*', function(event) {
        this.emit.apply(this, arguments);
    }.bind(this));
};

inherits(Chromecast, EventEmitter2);

Chromecast.prototype.states = {};

Chromecast.prototype.states.idle = {
    _onEnter: function() {
        if (this.player) {
            this.player.removeAllListeners();
            this.player.close();
        }

        if (this.client) {
            this.client.removeAllListeners();
            this.client.close();
        }

        delete this.address;
        delete this.player;
        delete this.client;
    }
};

Chromecast.prototype.states.findClient = {
    _onEnter: function() {
        this.handle('find');
    },
    find: function() {
        logger.info('[%s] find client', namespace);

        var sequence = [
            mdns.rst.DNSServiceResolve(),
            mdns.rst.getaddrinfo({ families: [4] }),
            mdns.rst.makeAddressesUnique()
        ];
        this.browser = mdns.createBrowser(mdns.tcp('googlecast'), { resolverSequence: sequence });
        this.browser.once('serviceUp', function(service) {
            this.handle('found', service);
        }.bind(this));

        this.browser.start();
    },
    found: function(service) {
        logger.info('[%s] found client', namespace);

        this.address = service.addresses[0];
        this.transition("connectClient");
    },
    _onExit: function() {
        this.browser.stop();
        delete this.browser;
    }
};

Chromecast.prototype.states.connectClient = {
    _onEnter: function() {
        this.handle('connect');
    },
    connect: function() {
        logger.info('[%s] connect to client: address=`%s`', namespace, this.address);

        this._connectTimeout = setTimeout(function() {
            this.handle("timeout");
        }.bind(this), config.chromecast.timeout);

        this.client = new Client();
        this.client.once('error', function(err) {
            this.client.close();
        }.bind(this));

        this.client.connect(this.address, function(err) {
            if (err) {
                this.handle('error', err);
            } else {
                this.handle('connected');
            }
        }.bind(this));
    },
    connected: function() {
        logger.info('[%s] connected to client', namespace);

        clearTimeout(this._connectTimeout);

        this.client.once('close', function(err) {
            this.transition('findClient');
        }.bind(this));

        this.transition('findSession');
    },
    error: function(err) {
        logger.warn('[%s] cannot connect to client (error): %s', namespace, err);
        this.transition("findClient");
    },
    timeout: function() {
        logger.warn('[%s] cannot connect to client (timeout)', namespace);
        this.transition("findClient");
    },
    _onExit: function() {
        clearTimeout(this._connectTimeout);
    }
};

Chromecast.prototype.states.findSession = {
    _onEnter: function() {
        this.handle('find');
    },
    find: function() {
        logger.info('[%s] find session', namespace);

        this._getSessionsTimeout = setTimeout(function() {
            this.handle("timeout");
        }.bind(this), config.chromecast.timeout);

        this.client.getSessions(function(err, sessions) {
            if (err) {
                this.handle('error', err);
            } else {
                this.handle('sessions', sessions);
            }
        }.bind(this));
    },
    sessions: function(sessions) {
        clearTimeout(this._getSessionsTimeout);

        for (var i = 0; i < sessions.length; i++) {
            var session = sessions[i];
            if (session.appId !== 'E8C28D3C') {
                logger.info('[%s] found session', namespace);

                this.session = session;
                this.transition('joinSession');

                return;
            }
        }

        this._requestSessionsTimeout = setTimeout(function() {
            this.handle('find');
        }.bind(this), config.chromecast.interval);
    },
    error: function(err) {
        logger.warn('[%s] cannot find sessions (error): %s', namespace, err);
        this.client.close();
    },
    timeout: function() {
        logger.warn('[%s] cannot find sessions (timeout)', namespace);
        this.client.close();
    },
    _onExit: function() {
        clearTimeout(this._requestSessionsTimeout);
    }
};

Chromecast.prototype.states.joinSession = {
    _onEnter: function() {
        this.handle('join');
    },
    join: function() {
        logger.info('[%s] join session: appId=`%s` displayName=`%s`', namespace, this.session.appId, this.session.displayName);

        this._joinTimeout = setTimeout(function() {
            this.handle("timeout");
        }.bind(this), config.chromecast.timeout);

        this.client.join(this.session, DefaultMediaReceiver, function(err, player) {
            if (err) {
                this.handle('error', err);
            } else {
                this.handle('joined', player);
            }
        }.bind(this));
    },
    joined: function(player) {
        logger.info('[%s] joined session', namespace);

        clearTimeout(this._joinTimeout);

        this.player = player;

        this.emit('connected');

        this.player.once('close', function(err) {
            this.emit('disconnected');
            this.transition('findSession');
        }.bind(this));

        this.transition('updateStatus');
    },
    error: function(err) {
        logger.warn('[%s] cannot join session (error): %s', namespace, err);
        this.transition("findSession");
    },
    timeout: function() {
        logger.warn('[%s] cannot join session (timeout)', namespace);
        this.transition("findSession");
    },
    _onExit: function() {
        clearTimeout(this._joinTimeout);
    }
};

Chromecast.prototype.states.updateStatus = {
    _onEnter: function() {
        logger.info('[%s] begin update status: interval=`%dms`', namespace, config.chromecast.interval);

        this.handle('update');
    },
    update: function() {
        this._getStatusTimeout = setTimeout(function() {
            this.handle("timeout");
        }.bind(this), config.chromecast.timeout);

        this.player.getStatus(function(err, status) {
            if (err) {
                this.handle('error', err);
            } else {
                this.handle('status', status || {});
            }
        }.bind(this));
    },
    status: function(status) {
        clearTimeout(this._getStatusTimeout);

        this._requestStatusTimeout = setTimeout(function() {
            this.handle('update');
        }.bind(this), config.chromecast.interval);

        this.emit('status', status);
    },
    error: function(err) {
        logger.warn('[%s] cannot update status (error): %s', namespace, err);
        this.player.close();
    },
    timeout: function() {
        logger.warn('[%s] cannot update status (timeout)', namespace);
        this.player.close();
    },
    _onExit: function() {
        clearTimeout(this._getStatusTimeout);
        clearTimeout(this._requestStatusTimeout);
    }
};

Chromecast.prototype.connect = function() {
    this.fsm.transition('findClient');
};

Chromecast.prototype.disconnect = function() {
    this.fsm.transition('idle');
};

Chromecast.prototype.play = function() {
    if (this.fsm.player) {
        this.fsm.player.play();
    }
};

Chromecast.prototype.pause = function() {
    if (this.fsm.player) {
        this.fsm.player.pause();
    }
};

Chromecast.prototype.stop = function() {
    if (this.fsm.player) {
        this.fsm.player.stop();
    }
};

Chromecast.prototype.seek = function(position) {
    if (this.fsm.player) {
        this.fsm.player.seek(position / 1000000);
    }
};

module.exports = Chromecast;
