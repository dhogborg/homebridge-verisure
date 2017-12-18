# homebridge-verisure

This is a plugin for [homebridge](https://github.com/nfarina/homebridge). It's a
working implementation for several Verisure devices:

- [x] __ALARM__ - Arm/Disarm the alarm
- [x] __DOORLOCK__ - Yale Doorman Lock/Unlock
- [x] __HUMIDITY1__ - Temperature
- [x] __SIREN1__ - Temperature
- [x] __SMARTCAMERA1__ - Temperature
- [x] __SMARTPLUG__ - State, on, off
- [x] __SMOKE2__ - Temperature
- [x] __VOICEBOX1__ - Temperature

## Installation

```bash
npm install -g homebridge-verisure
```

Now you can update your configuration file to enable the plugin, see sample
snippet below.

## Configuration

As part of your configuration, add an object with your Verisure credentials to
your array (list) of enabled platform plugins.

```json
"platforms": [
  {
    "platform" : "verisure",
    "name" : "Verisure",
    "email": "your@email.com",
    "password": "yourT0p5ecre7Passw0rd",
    "ignore_alarms": ["00000000000"], // alarm serial no
    "alarmcode": "0000", // remove or set to false to disable alarm integration
    "doorcode": "000000"
  }
]
```

## Building

Before building you need to install the project dependencies. Yarn is recommended over npm to get fully reproducible builds with correct version for all dependencies. The `yarn.lock` file contains the version hashes. Run `yarn install`.

Building the project from TypeScript is as easy as `yarn run build`. That will use the local version of `tsc` to transpile TypeScript to commonJS.