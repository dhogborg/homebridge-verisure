import * as verisure from 'verisure'

let VERISURE_DEVICE_NAMES: string[] = []
let Characteristic : any

export function init(characteristic: any) {
    Characteristic = characteristic
}

export function getUniqueName(name: string): string {
  if (VERISURE_DEVICE_NAMES.indexOf(name) > -1) {
    const match = name.match(/(.+) #(\d+)/) || [null, name, 1]
    return getUniqueName(`${match[1]} #${parseInt("" + match[2]) + 1}`)
  } else {
    VERISURE_DEVICE_NAMES.push(name)
    return name
  }
}

export function hapArmState(verisureArmState: verisure.AlarmArmState) {
  switch (verisureArmState) {
    case verisure.AlarmArmState.Away:
      return Characteristic.SecuritySystemCurrentState.AWAY_ARM
    case verisure.AlarmArmState.Home:
      return Characteristic.SecuritySystemCurrentState.STAY_ARM
    case verisure.AlarmArmState.Disarmed:
      return Characteristic.SecuritySystemCurrentState.DISARMED
    default:
      throw new Error(`arm state "${verisureArmState}" is not a known state`)
  }
}
