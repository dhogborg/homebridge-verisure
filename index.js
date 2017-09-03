'use strict';

const verisure = require('verisure');


let Accessory,
    Service,
    Characteristic,
    UUIDGen;

const PLUGIN_NAME = 'homebridge-verisure';
const PLATFORM_NAME = 'verisure';
const MANUFACTURER = 'Verisure';

const DEVICE_TYPES = {
  'ALARM': 'Larm',
  'DOORLOCK': 'Yale Doorman',
  'HUMIDITY1': 'Klimatdetektor',
  'SIREN1': 'Siren',
  'SMARTCAMERA1': 'Smart Camera',
  'SMARTPLUG': 'Smart plug',
  'SMOKE2': 'Rökdetektor',
  'VOICEBOX1': 'Directenhet'
}

let VERISURE_TOKEN = null
let OVERVIEW_PROMISES = {}
let VERISURE_DEVICE_NAMES = []


const getVerisureInstallations = function(config) {
  return new Promise(function(resolve, reject) {
    verisure.auth(config.email, config.password, function(err, token) {
      if (err) return reject(err);
      VERISURE_TOKEN = token;
  
      verisure.installations(token, config.email, function(err, installations) {
        if (err) return reject(err);
        resolve(installations)
      });
    });
  })
}

const getOverview = function(installation) {
  let giid = installation.giid
  if (OVERVIEW_PROMISES[giid]) {
    return OVERVIEW_PROMISES[giid]
  }

  OVERVIEW_PROMISES[giid] = new Promise(function(resolve, reject) {
    verisure.overview(VERISURE_TOKEN, installation, function(err, overview) {
      OVERVIEW_PROMISES[giid] = null;
      if (err) {
        reject(err)
        return
      }
      resolve(overview)
    });
  })
  
  return OVERVIEW_PROMISES[giid]
}

const getUniqueName = function(name) {
  if (VERISURE_DEVICE_NAMES.includes(name)) {
    const match = name.match(/(.+) #(\d+)/) || [null, name, 1]
    return getUniqueName(`${match[1]} #${parseInt(match[2])+1}`);
  }
  else {
    VERISURE_DEVICE_NAMES.push(name)
    return name;
  }
}


module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;

  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, VerisurePlatform, true);
}


const VerisurePlatform = function(log, config, api) {
  const platform = this;
  this.log = log;
  this.config = config;
  this.accessories = function(callback) {
    getVerisureInstallations(config).then(function(installations) {
      let promises = installations.map(function(installation) {
        return new Promise(function(resolve, reject) {
          verisure.overview(VERISURE_TOKEN, installation, function(err, overview) {
            if (err) {
              reject(err)
              return
            }

            let devices = []
          
            if (config.alarmcode && !config.ignore_alarms.includes(installation.giid)) {
              const deviceName = DEVICE_TYPES['ALARM'] || device.deviceType
              const device = new VerisureAccessory(log, {
                installation: installation,
                name: getUniqueName(`${deviceName} (${installation.street})`),
                model: 'ALARM',
                serialNumber: installation.giid, // the alarm is part of the installation, not a device with a serial no.
                alarmcode: config.alarmcode,
                value: hapArmState(overview.armState.statusType)
              })
              devices.push(device)
            }

            devices = devices.concat(overview.climateValues.map(function(device) {
              const deviceName = DEVICE_TYPES[device.deviceType] || device.deviceType
              return new VerisureAccessory(log, {
                installation: installation,
                name: getUniqueName(`${deviceName} (${device.deviceArea})`),
                model: device.deviceType,
                serialNumber: device.deviceLabel,
                value: 0
              });
            }));

            devices = devices.concat(overview.smartPlugs.map(function(device) {
              return new VerisureAccessory(log, {
                installation: installation,
                name: getUniqueName(`${DEVICE_TYPES.SMARTPLUG} (${device.area})`),
                model: 'SMARTPLUG',
                serialNumber: device.deviceLabel,
                value: device.currentState == 'ON' ? 1 : 0
              });
            }));

            if (overview && overview.doorLockStatusList){
              devices = devices.concat(overview.doorLockStatusList.map(function(device){
                  return new VerisureAccessory(log, {
                    installation: installation,
                    name: getUniqueName(`${device.area}`),
                    model: 'DOORLOCK',
                    serialNumber: device.deviceLabel,
                    value: device.lockedState==='LOCKED' ? 1 : 0,
                    doorcode: config.doorcode,
                    category: 6 // Hardcoded from Accessory.Categories in Accessory.js of hap-nodejs
                  });
              }));
            }
            resolve(devices);
          });
        })
      })
      return Promise.all(promises)
    }).then(function(results){
      let devices = []
      results.map(function(result) {
        devices = devices.concat(result)
      })
      callback(devices);
    }).catch(function(err) {
      log.error(err)
    })
  }
}


const VerisureAccessory = function(log, config) {
  this.log = log;
  this.config = config;
  
  this.installation = config.installation
  this.name = config.name;
  this.model = config.model;
  this.serialNumber = config.serialNumber;
  this.value = config.value;
  this.service = null;
}

const ErrAccessoryNotFound = new Error("Accessory not found in overview")

VerisureAccessory.prototype = {
  _getCurrentTemperature: function(callback) {
    this.log(`${this.name} (${this.serialNumber}): Getting current temperature...`);
    getOverview(this.installation).then((overview) => {
      for (let device of overview.climateValues) {
        if (device.deviceLabel == this.serialNumber)
          return device
      }
      throw ErrAccessoryNotFound
    }).then((device) =>{
      this.value = device.temperature;
      callback(null, this.value);
    }).catch((err) => {
      callback(`${this.name} ${this.serialNumber}: ${err}`)
    })
	},

  _getSwitchValue: function(callback) {
    this.log(`${this.name} (${this.serialNumber}): Getting current value...`);
    getOverview(this.installation).then((overview) => {
      for (let device of overview.smartPlugs) {
        if (device.deviceLabel == this.serialNumber)
          return device
      }
      throw ErrAccessoryNotFound
    }).then((device) =>{
      this.value = device.currentState == 'ON' ? 1 : 0
      callback(null, this.value);
    }).catch((err) => {
      callback(`${this.name} ${this.serialNumber}: ${err}`)
    })
  },

  _setSwitchValue: function(value, callback) {
    this.log(`${this.name} (${this.serialNumber}): Setting current value to "${value}"...`);
    this.value = value;

    verisure._apiClient({
      method: 'POST',
      uri: `/installation/${this.installation.giid}/smartplug/state`,
      headers: {
        'Cookie': `vid=${VERISURE_TOKEN}`,
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      json: [
        {
          deviceLabel: this.serialNumber,
          state: value == 1 ? true : false
        }
      ]
    }, callback);
  },

  _getCurrentLockState: function(callback){
    this.log(`${this.name} (${this.serialNumber}): GETTING CURRENT LOCK STATE`);
    verisure._apiClient({
        method: 'GET',
        uri: `/installation/${this.installation.giid}/doorlockstate/search`,
        headers: {
          'Cookie': `vid=${VERISURE_TOKEN}`,
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
    }, function (callback, error, response){
      this.log(`**** Response: getCurrentLockState: ${JSON.stringify(response)}`);
      if (error) callback(error);
      if (response && response.statusCode == 200){
        let body = JSON.parse(response.body);
        for (let doorlock of body){
          if (doorlock.deviceLabel == this.serialNumber){
            if (doorlock.motorJam){
              this.value=Characteristic.LockCurrentState.JAMMED;
              callback(null, this.value);
              break;
            } else {
              this.value = doorlock.currentLockState == "UNLOCKED" ? Characteristic.LockCurrentState.UNSECURED : Characteristic.LockCurrentState.SECURED ;
              callback(null, this.value);
              break;
            }
          }
        }
      }
    }.bind(this, callback));
  },

  _getTargetLockState: function(callback){
    this.log(`${this.name} (${this.serialNumber}): GETTING TARGET LOCK STATE.`);
    
    verisure._apiClient({
        method: 'GET',
        uri: `/installation/${this.installation.giid}/doorlockstate/search`,
        headers: {
          'Cookie': `vid=${VERISURE_TOKEN}`,
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
    }, function(callback, error, response){
      this.log(`**** Response: getTargetLockState: ${JSON.stringify(response)}`);
      if (error) callback(error);
      if (response && response.statusCode == 200){
        let body = JSON.parse(response.body);
        for (let doorlock of body){
          if (doorlock.deviceLabel == this.serialNumber) {
            let targetLockState = doorlock.pendingLockState == "NONE" ? doorlock.currentLockState : doorlock.pendingLockState;
            callback(error, targetLockState == "UNLOCKED" ? Characteristic.LockTargetState.UNSECURED : Characteristic.LockTargetState.SECURED);
          }
        }
      }

    }.bind(this, callback));
  },

  _setTargetLockState: function(value, callback){
    this.log(`${this.name} (${this.serialNumber}): Setting TARGET LOCK STATE to "${value}"`);
    let actionValue = value ? "lock":"unlock";
    verisure._apiClient({
      method: 'PUT',
      uri: `/installation/${this.installation.giid}/device/${this.serialNumber}/${actionValue}`,
      headers: {
        'Cookie': `vid=${VERISURE_TOKEN}`,
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      json: 
      {
          "code": this.config.doorcode
      }
    }, function(value, callback, error, response){
      this.log(`***** Response from ${actionValue}-operation: ${JSON.stringify(response)}`);
      if (error != null) callback(error, response);
      if (response && response.statusCode != 200) {
        if (response.statusCode == 400 && response.body && response.body.errorCode == "VAL_00819"){
          this.service.setCharacteristic(Characteristic.LockCurrentState, value)
          this.value = value;
          callback (null);
        } else {
          callback(response);
        }
      } else {
        this._waitForLockStatusChangeResult(value, callback, response);
      }
    }.bind(this,value,callback))
  },

  _waitForLockStatusChangeResult: function(value, callback, response){
    setTimeout(function(value, callback, response){
      verisure._apiClient({
        method: 'GET',
        uri: `/installation/${this.installation.giid}/doorlockstate/change/result/${response.body.doorLockStateChangeTransactionId}`,
        headers: {
          'Cookie': `vid=${VERISURE_TOKEN}`,
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
      }, function(value, origResponse, callback,error,response){
        if (error != null) 
          this.log(`**** ERROR: ${JSON.stringify(error)}`);
        
        this.log(`**** Response: Doorlockstate: ${JSON.stringify(response)}`);
        let body = JSON.parse(response.body);
        if (body.result == "NO_DATA"){
          this._waitForLockStatusChangeResult(value, callback, origResponse);
        } else {
          this.service.setCharacteristic(Characteristic.LockCurrentState, value)
          this.value = value;
          callback (null);
        }
      }.bind(this, value, response, callback));
    }.bind(this, value, callback, response)
    ,200);
  },

  _getCurrentAlarmState: function(callback) {
    this.log(`${this.name}: Getting current alarm state...`);
    getOverview(this.installation).then((overview) => {
      if (err) return callback(err);
      this.value = hapArmState(overview.armState.statusType)
      callback(null, that.value)
    }).catch((err) => {
      callback(`${this.name}: ${err}`)
    })
  },

  _setTargetAlarmState: function(value, callback) {
    let targetState = ""
    switch (value) {
    case Characteristic.SecuritySystemTargetState.AWAY_ARM:
        targetState = 'ARMED_AWAY'
        break
    case Characteristic.SecuritySystemTargetState.STAY_ARM:
    case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
        targetState = 'ARMED_HOME'
        break
    case Characteristic.SecuritySystemTargetState.DISARM:
        targetState = 'DISARMED'
        break
    }
    
    this.log(`${this.name} (${this.serialNumber}): Setting TARGET ALARM STATE to ${value} (${targetState})`);
    verisure._apiClient({
      method: 'PUT',
      uri: `/installation/${this.installation.giid}/armstate/code`,
      headers: {
        'Cookie': `vid=${VERISURE_TOKEN}`,
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      json: {
          "code": "" + this.config.alarmcode,
          "state": targetState
      }
    }, function(value, callback, error, response){
      if (error != null) callback(error, response);
      if (response && response.statusCode != 200) {
        if (response.statusCode == 400 && response.body && response.body.errorCode == "VAL_00818"){
          // Failed due to code not valid at this time, probably already in the target state
          this.service.setCharacteristic(Characteristic.SecuritySystemCurrentState, value)
          this.value = value;
          callback (null);
        } else {
          callback(response);
        }
      } else {
        this._waitForArmStatusChangeResult(value, callback, response);
      }
    }.bind(this,value,callback))
  },

  _waitForArmStatusChangeResult: function(value, callback, response){
    setTimeout(function(value, callback, response){
      verisure._apiClient({
        method: 'GET',
        uri: `/installation/${this.installation.giid}/code/result/${response.body.armStateChangeTransactionId}`,
        headers: {
          'Cookie': `vid=${VERISURE_TOKEN}`,
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
      }, function(value, origResponse, callback,error,response){
        if (error != null) 
          this.log(`**** ERROR: ${JSON.stringify(error)}`);
        
        let body = JSON.parse(response.body);
        if (body.result == "NO_DATA"){
          this._waitForArmStatusChangeResult(value, callback, origResponse);
        } else {
          this.service.setCharacteristic(Characteristic.SecuritySystemCurrentState, value)
          this.value = value;
          callback (null);
        }
      }.bind(this, value, response, callback));
    }.bind(this, value, callback, response)
    ,200);
  },

  getServices: function() {
    const accessoryInformation = new Service.AccessoryInformation();
    accessoryInformation
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, DEVICE_TYPES[this.model] || this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)

    let service = null;

    if (['SMARTPLUG'].includes(this.model)) {
      service = new Service.Switch(this.name);
      service
        .getCharacteristic(Characteristic.On)
        .on('get', this._getSwitchValue.bind(this))
        .on('set', this._setSwitchValue.bind(this))
        .value = this.value;
    }

    if (['DOORLOCK'].includes(this.model)){
      service = new Service.LockMechanism(this.name);
      service
        .getCharacteristic(Characteristic.LockCurrentState)
        .on('get', this._getCurrentLockState.bind(this));

      service
        .getCharacteristic(Characteristic.LockTargetState)
        .on('get', this._getTargetLockState.bind(this))
        .on('set', this._setTargetLockState.bind(this));

      this.service = service;
    }

    if (['ALARM'].includes(this.model)) {
      service = new Service.SecuritySystem(this.name);
      service
        .getCharacteristic(Characteristic.SecuritySystemCurrentState)
        .on('get', this._getCurrentAlarmState.bind(this))

      service
        .getCharacteristic(Characteristic.SecuritySystemTargetState)
        .on('get', this._getCurrentAlarmState.bind(this))
        .on('set', this._setTargetAlarmState.bind(this))
      
      this.service = service;
    }

    if (['HUMIDITY1', 'SIREN1', 'SMARTCAMERA1' ,'SMOKE2', 'VOICEBOX1'].includes(this.model)) {
      service = new Service.TemperatureSensor(this.name);
      service
        .getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this._getCurrentTemperature.bind(this));
    }

    if (!service) {
      this.log.error(`Device ${this.model} is not yet supported`);
    }

    return [accessoryInformation, service]
  }
}


const hapArmState = function(verisureArmState) {
  switch (verisureArmState) {
  case 'ARMED_AWAY':
      return Characteristic.SecuritySystemCurrentState.AWAY_ARM
  case 'ARMED_HOME':
      return Characteristic.SecuritySystemCurrentState.STAY_ARM
  case 'DISARMED':
      return Characteristic.SecuritySystemCurrentState.DISARMED
  default:
      throw new Error(`arm state "${verisureArmState}" is not a known state`)
  }
}
