/// <reference path="types.d.ts"/>

import * as verisure from "verisure"
import * as api from "./api"
import { init as utilsInit } from "./utils"
import {
  init as accessoryInit,
  VerisureAccessory,
  Alarm,
  ClimateSensor,
  SmartPlug,
  DoorLock,
} from "./accessories"

interface PluginConfig {
  platform: string
  name: string
  email: string
  password: string
  doorcode?: string
  ignore_alarms?: string[]
  alarmcode?: string
}

const PLUGIN_NAME = "homebridge-verisure"
const PLATFORM_NAME = "verisure"

export = function(homebridge: any) {
  accessoryInit(homebridge.hap.Service, homebridge.hap.Characteristic)
  utilsInit(homebridge.hap.Characteristic)

  homebridge.registerPlatform(
    PLUGIN_NAME,
    PLATFORM_NAME,
    function(log: Log, config: PluginConfig) {
      return new VerisurePlatform(log, config)
    },
    true,
  )
}

class VerisurePlatform {
  log: Log
  config: PluginConfig

  constructor(log: Log, config: PluginConfig) {
    this.log = log
    this.config = config
  }

  accessories(callback: (devices: any[]) => void) {
    api
      .getVerisureInstallations(this.config.email, this.config.password)
      .then(installations => {
        let promises = installations.map(installation => {
          return new Promise((resolve, reject) => {
            verisure.overview(api.VERISURE_TOKEN, installation, (err, overview) => {
              if (err) {
                reject(err)
                return
              }

              let devices: VerisureAccessory[] = []

              if (
                this.config.alarmcode &&
                this.config.ignore_alarms.indexOf(installation.giid) > -1
              ) {
                const device = new Alarm(
                  installation,
                  this.log,
                  overview.armState,
                  this.config.alarmcode,
                )
                devices.push(device)
              }

              devices = devices.concat(
                overview.climateValues.map(device => {
                  return new ClimateSensor(installation, this.log, device)
                }),
              )

              devices = devices.concat(
                overview.smartPlugs.map(device => {
                  return new SmartPlug(installation, this.log, device)
                }),
              )

              if (overview && overview.doorLockStatusList) {
                devices = devices.concat(
                  overview.doorLockStatusList.map(device => {
                    return new DoorLock(installation, this.log, device, this.config.doorcode)
                  }),
                )
              }
              resolve(devices)
            })
          })
        })
        return Promise.all(promises)
      })
      .then((results: VerisureAccessory[]) => {
        let devices: VerisureAccessory[] = []
        results.map(result => {
          devices = devices.concat(result)
        })
        callback(devices)
      })
      .catch((err: Error) => {
        this.log.error(err)
      })
  }
}
