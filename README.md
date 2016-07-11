# chromecast-dbus

Registers the chromecast in your local network as a media player on the D-bus. This enables various programs (e.g. desktop environment applets) to control your chromecast from your computer.

## Features

 - Automatically connects to your chromecast in your local network
 - Exposes the standard D-bus interface for media players according to the [Media Player Remote Interfacing Specification (MPRIS)](https://www.freedesktop.org/wiki/Specifications/mpris-spec/)
 - Supported playback controls: play, pause, stop, seek

## OS
- Unix-like (tested on Linux Mint 18)

## Install

First install the dependencies for [mdns](https://github.com/agnat/node_mdns), than install the project dependencies:

```
npm install
```

## Usage

```
node lib/main.js
```

## Config
See config/default.json

## Author

Marcel Lehwald <marcel.lehwald@googlemail.com>

## License

MIT
