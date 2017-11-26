import * as verisure from "verisure"
import * as api from "./api"
import * as utils from "./utils"

const MANUFACTURER = "Verisure"
const ErrAccessoryNotFound = new Error("Accessory not found in overview")

let Service: any
let Characteristic: any

export function init(service: any, characteristic: any) {
  Service = service
  Characteristic = characteristic
}

interface AccessoryConfig {
  model: DeviceType
  serialNumber: string
}

export class VerisureAccessory {
  log: Log

  installation: verisure.Installation
  config: AccessoryConfig
  service: any

  constructor(i: verisure.Installation, l: Log) {
    this.log = l
    this.service = null
    this.installation = i
  }

  // Helper method, looks for results of a transaction.
  // uri is diffrent depending on which service we are looking at, door, alarm or switch
  _waitForStatusChangeResult(uri: string): Promise<void> {
    const ErrNoData = new Error("no data")
    const ErrAttemptsExhasusted = new Error("to many attempts")
    let retries = 0
    const getResult: () => Promise<string> = () => {
      return api
        .apiCall({
          uri: uri,
        })
        .then((result: api.Response) => {
          if (result.body.result == "NO_DATA") {
            if (retries > 7) {
              throw ErrAttemptsExhasusted
            }
            retries++
            throw ErrNoData
          }
          return result.body.result
        })
    }

    let ref: number = null
    return new Promise<void>(function(resolve, reject) {
      ref = setInterval(function() {
        getResult()
          .then(function() {
            resolve()
          })
          .catch((err: Error) => {
            if (err == ErrNoData) {
              return // let the interval fire again and retry later
            }
            reject(err)
          })
      }, 200)
    }).then(function() {
      clearInterval(ref)
    })
  }

  // Helper method, setup the accessory information for this device
  getAccessoryInformation(c: AccessoryConfig) {
    const accessoryInformation = new Service.AccessoryInformation()
    accessoryInformation
      .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(Characteristic.Model, deviceTypeTitle(c.model))
      .setCharacteristic(Characteristic.SerialNumber, c.serialNumber)
    return accessoryInformation
  }
}

export class SmartPlug extends VerisureAccessory {
  name: string
  device: verisure.ControlPlug | verisure.SmartPlug
  value: 1 | 0

  constructor(i: verisure.Installation, l: Log, device: verisure.ControlPlug | verisure.SmartPlug) {
    super(i, l)

    this.name = utils.getUniqueName(`${deviceTypeTitle(DeviceType.SMARTPLUG)} (${device.area})`)
    this.device = device
    this.value = device.currentState == verisure.PlugState.On ? 1 : 0
    this.config = {
      model: DeviceType.SMARTPLUG,
      serialNumber: device.deviceLabel,
    }
  }

  getServices(): any[] {
    let service = new Service.Switch(this.name)
    service
      .getCharacteristic(Characteristic.On)
      .on("get", this._getSwitchValue.bind(this))
      .on("set", this._setSwitchValue.bind(this)).value = this.value

    return [this.getAccessoryInformation(this.config), service]
  }

  _getSwitchValue(callback: (error: any, value?: any) => void) {
    this.log(`${this.name} (${this.config.serialNumber}): Getting current value...`)
    api
      .getOverview(this.installation)
      .then(overview => {
        for (let device of overview.smartPlugs) {
          if (device.deviceLabel == this.config.serialNumber) return device
        }
        throw ErrAccessoryNotFound
      })
      .then(device => {
        this.value = device.currentState == verisure.PlugState.On ? 1 : 0
        callback(null, this.value)
      })
      .catch((err: Error) => {
        callback(`${this.name} ${this.config.serialNumber}: ${err}`)
      })
  }

  _setSwitchValue(value: 1 | 0, callback: (error: any) => void) {
    this.log(`${this.name} (${this.config.serialNumber}): Setting current value to "${value}"...`)
    this.value = value

    api
      .apiCall({
        method: "POST",
        uri: `/installation/${this.installation.giid}/smartplug/state`,
        json: [
          {
            deviceLabel: this.config.serialNumber,
            state: value == 1 ? true : false,
          },
        ],
      })
      .then(function() {
        callback(null)
      })
      .catch((err: Error) => {
        this.log.error(err)
        callback(`${this.name} ${this.config.serialNumber}: ${err}`)
      })
  }
}

export class DoorLock extends VerisureAccessory {
  name: string
  device: verisure.DoorLock
  doorCode: string
  category: number = 6 // Hardcoded from Accessory.Categories in Accessory.js of hap-nodejs
  value: 0 | 1

  constructor(i: verisure.Installation, l: Log, device: verisure.DoorLock, doorCode: string) {
    super(i, l)

    this.name = utils.getUniqueName(`${device.area}`)
    this.device = device
    this.doorCode = doorCode
    this.value = device.lockedState === verisure.DoorLockState.Locked ? 1 : 0
    this.config = {
      model: DeviceType.DOORLOCK,
      serialNumber: device.deviceLabel,
    }
  }

  getServices(): any[] {
    let service = new Service.LockMechanism(this.name)
    service
      .getCharacteristic(Characteristic.LockCurrentState)
      .on("get", this._getCurrentLockState.bind(this))

    service
      .getCharacteristic(Characteristic.LockTargetState)
      .on("get", this._getTargetLockState.bind(this))
      .on("set", this._setTargetLockState.bind(this))

    this.service = service

    return [this.getAccessoryInformation(this.config), service]
  }

  _getCurrentLockState(callback: (error: any, value?: any) => void) {
    this.log(`${this.name} (${this.config.serialNumber}): GETTING CURRENT LOCK STATE`)
    api
      .apiCall({
        uri: `/installation/${this.installation.giid}/doorlockstate/search`,
      })
      .then(result => {
        let body: verisure.DoorLockRequestResponse[] = result.body
        for (let doorlock of body) {
          if (doorlock.deviceLabel != this.config.serialNumber) {
            // this is not the droi...*DOOR* you are looking for!
            continue
          }
          if (doorlock.motorJam) {
            return Characteristic.LockCurrentState.JAMMED
          }
          switch (doorlock.currentLockState) {
            case verisure.DoorLockState.Unlocked:
              return Characteristic.LockCurrentState.UNSECURED
            default:
              return Characteristic.LockCurrentState.SECURED
          }
        }
        return null
      })
      .then(state => {
        if (!state) {
          // the door we are looking for is no longer in the results
          throw new Error("Doorlock not found")
        }
        this.value = state
        callback(null, state)
      })
      .catch((err: Error) => {
        this.log.error(err)
        callback(err)
      })
  }

  _getTargetLockState(callback: (error: any, value?: any) => void) {
    this.log(`${this.name} (${this.config.serialNumber}): GETTING TARGET LOCK STATE.`)

    api
      .apiCall({
        uri: `/installation/${this.installation.giid}/doorlockstate/search`,
      })
      .then(result => {
        let body: verisure.DoorLockRequestResponse[] = result.body
        for (let doorlock of body) {
          if (doorlock.deviceLabel != this.config.serialNumber) {
            continue
          }
          let targetLockState =
            doorlock.pendingLockState == verisure.PendingDoorLockState.None
              ? doorlock.currentLockState
              : doorlock.pendingLockState

          switch (targetLockState) {
            case verisure.DoorLockState.Unlocked:
              return Characteristic.LockTargetState.UNSECURED
            default:
              return Characteristic.LockTargetState.SECURED
          }
        }
      })
      .then((state: verisure.DoorLockState | null) => {
        if (!state) {
          // the door we are looking for is no longer in the results
          throw new Error("Doorlock not found")
        }
        callback(null, state)
      })
      .catch((err: Error) => {
        this.log.error(err)
        callback(err)
      })
  }

  _setTargetLockState(value: 1 | 0, callback: (error: any) => void) {
    this.log(`${this.name} (${this.config.serialNumber}): Setting TARGET LOCK STATE to "${value}"`)

    let actionValue = value ? "lock" : "unlock"
    api
      .apiCall({
        method: "PUT",
        uri: `/installation/${this.installation.giid}/device/${
          this.config.serialNumber
        }/${actionValue}`,
        json: {
          code: this.doorCode,
        },
      })
      .then(
        (result: api.Response) => {
          // either wait for the transaction to commit...
          let id = result.body.doorLockStateChangeTransactionId
          return this._waitForStatusChangeResult(
            `/installation/${this.installation.giid}/doorlockstate/change/result/${id}`,
          )
        },
        (result: api.Response) => {
          // or inspect the error and try to recover from it
          let { error, response } = result
          switch (response.statusCode) {
            case 400:
              if (error.errorCode == "VAL_00819") {
                // the door is already in the target state
                return
              }
            default:
              throw new Error(error.errorMessage)
          }
        },
      )
      .then(() => {
        // either way, we end up with a value (or an error)
        this.service.setCharacteristic(Characteristic.LockCurrentState, value)
        this.value = value
        callback(null)
      })
      .catch(err => {
        this.log.error(err)
        callback(err)
      })
  }
}

export class Alarm extends VerisureAccessory {
  name: string
  device: verisure.ArmState
  alarmCode: string
  value: number

  constructor(i: verisure.Installation, l: Log, device: verisure.ArmState, alarmCode: string) {
    super(i, l)

    this.name = utils.getUniqueName(`${deviceTypeTitle(DeviceType.ALARM)} (${i.street})`)
    this.device = device
    this.alarmCode = alarmCode
    this.value = utils.hapArmState(device.statusType)
    this.config = {
      model: DeviceType.ALARM,
      serialNumber: i.giid,
    }
  }

  getServices(): any[] {
    let service = new Service.SecuritySystem(this.name)
    service
      .getCharacteristic(Characteristic.SecuritySystemCurrentState)
      .on("get", this._getCurrentAlarmState.bind(this))

    service
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .on("get", this._getCurrentAlarmState.bind(this))
      .on("set", this._setTargetAlarmState.bind(this))

    this.service = service

    return [this.getAccessoryInformation(this.config), service]
  }

  _getCurrentAlarmState(callback: (error: any, value?: any) => void) {
    this.log(`${this.name}: Getting current alarm state...`)
    api
      .getOverview(this.installation)
      .then(overview => {
        this.value = utils.hapArmState(overview.armState.statusType)
        callback(null, this.value)
      })
      .catch(err => {
        callback(`${this.name}: ${err}`)
      })
  }

  _setTargetAlarmState(value: any, callback: (error: any) => void) {
    let targetState: verisure.AlarmArmState
    switch (value) {
      case Characteristic.SecuritySystemTargetState.AWAY_ARM:
        targetState = verisure.AlarmArmState.Away
        break
      case Characteristic.SecuritySystemTargetState.STAY_ARM:
      case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
        targetState = verisure.AlarmArmState.Home
        break
      case Characteristic.SecuritySystemTargetState.DISARM:
        targetState = verisure.AlarmArmState.Disarmed
        break
      default:
        this.log.error("Unknown Alarm target state: ", value)
        return
    }

    this.log(
      `${this.name} (${this.config.serialNumber}): ` +
        `Setting TARGET ALARM STATE to ${value} (${targetState})`,
    )
    api
      .apiCall({
        method: "PUT",
        uri: `/installation/${this.installation.giid}/armstate/code`,
        json: {
          code: "" + this.alarmCode, // forcibly cast to string
          state: targetState,
        },
      })
      .then(
        (result: api.Response) => {
          // either wait for the transaction to commit...
          let id = result.body.armStateChangeTransactionId
          return this._waitForStatusChangeResult(
            `/installation/${this.installation.giid}/code/result/${id}`,
          )
        },
        (result: api.Response) => {
          // or inspect the error and try to recover from it
          let { error, response } = result
          switch (response.statusCode) {
            case 400:
              if (error.errorCode == "VAL_00819") {
                // the door is already in the target state
                return
              }
            default:
              throw new Error(error.errorMessage)
          }
        },
      )
      .then(() => {
        // either way, we end up with a value (or an error)
        this.service.setCharacteristic(Characteristic.SecuritySystemCurrentState, value)
        this.value = value
        callback(null)
      })
      .catch(err => {
        this.log.error(err)
        callback(err)
      })
  }
}

export class ClimateSensor extends VerisureAccessory {
  name: string
  device: verisure.ClimateValues
  value: number

  constructor(i: verisure.Installation, l: Log, device: verisure.ClimateValues) {
    super(i, l)

    const model: DeviceType = (<any>DeviceType)[device.deviceType]
    const deviceName = deviceTypeTitle(model)
    this.name = utils.getUniqueName(`${deviceName} (${device.deviceArea})`)
    this.device = device
    this.value = device.temperature
    this.config = {
      model: model,
      serialNumber: device.deviceLabel,
    }
  }

  getServices(): any[] {
    let service = new Service.TemperatureSensor(this.name)
    service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on("get", this._getCurrentTemperature.bind(this))

    return [this.getAccessoryInformation(this.config), service]
  }

  _getCurrentTemperature(callback: (error: any, value?: any) => void) {
    this.log(`${this.name} (${this.config.serialNumber}): Getting current temperature...`)
    api
      .getOverview(this.installation)
      .then(overview => {
        for (let device of overview.climateValues) {
          if (device.deviceLabel == this.config.serialNumber) return device
        }
        throw ErrAccessoryNotFound
      })
      .then(device => {
        this.value = device.temperature
        callback(null, this.value)
      })
      .catch((err: Error) => {
        callback(`${this.name} ${this.config.serialNumber}: ${err}`)
      })
  }
}

enum DeviceType {
  ALARM = "ALARM",
  DOORLOCK = "DOORLOCK",
  HUMIDITY1 = "HUMIDITY1",
  SIREN1 = "SIREN1",
  SMARTCAMERA1 = "SMARTCAMERA1",
  SMARTPLUG = "SMARTPLUG",
  SMOKE2 = "SMOKE2",
  VOICEBOX1 = "VOICEBOX1",
}

function deviceTypeTitle(t?: DeviceType): string {
  switch (t) {
    case DeviceType.ALARM:
      return "Larm"
    case DeviceType.DOORLOCK:
      return "Yale Doorman"
    case DeviceType.HUMIDITY1:
      return "Klimatdetektor"
    case DeviceType.SIREN1:
      return "Siren"
    case DeviceType.SMARTCAMERA1:
      return "Smart Camera"
    case DeviceType.SMARTPLUG:
      return "Smart plug"
    case DeviceType.SMOKE2:
      return "Rökdetektor"
    case DeviceType.VOICEBOX1:
      return "Directenhet"
    default:
      return "Okänd enhet: " + t
  }
}
