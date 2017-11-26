declare module "verisure" {
  export interface Installation {
    giid: string
    firmwareVersion: number
    routingGroup: string
    shard: number
    locale: string
    signalFilterId: number
    deleted: boolean
    cid: string
    street: string
    streetNo1: string
    streetNo2: string
    alias: string
  }
  export interface Overview {
    accountPermissions: { accountPermissionsHash: string }
    armState: ArmState
    armstateCompatible: boolean
    controlPlugs: ControlPlug[]
    smartPlugs: SmartPlug[]
    doorLockStatusList: DoorLock[]
    totalSmsCount: number
    climateValues: ClimateValues[]
    installationErrorList: any[]
    pendingChanges: number
    ethernetModeActive: boolean
    ethernetConnectedNow: boolean
    heatPumps: any[]
    smartCameras: any[]
    latestEthernetStatus: {
      latestEthernetTestResult: boolean
      testDate: Date
      protectedArea: string
      deviceLabel: string
    }
    customerImageCameras: any[]
    batteryProcess: { active: boolean }
    userTracking: {
      installationStatus: boolean
      users: User[]
      locations: [
        {
          locationName: string
          locationId: string
          isInstallationAddress: boolean
        }
      ]
    }
    eventCounts: any[]
    doorWindow: {
      reportState: boolean
      doorWindowDevice: DoorWindow[]
    }
  }
  export const enum PlugState {
    On = "ON",
    Off = "OFF",
  }
  export const enum PendingPlugState {
    On = "ON",
    Off = "OFF",
    None = "NONE",
  }
  export interface ControlPlug {
    deviceId: string
    deviceLabel: string
    area: string
    profile: string
    currentState: PlugState
    pendingState: PendingPlugState
  }
  export interface SmartPlug {
    icon: string
    isHazardous: boolean
    deviceLabel: string
    area: string
    currentState: PlugState
    pendingState: PendingPlugState
  }

  export const enum AlarmArmState {
    Away = "ARMED_AWAY",
    Home = "ARMED_HOME",
    Disarmed = "DISARMED",
  }
  export interface ArmState {
    statusType: AlarmArmState
    date: Date
    name: string
    changedVia: string
  }
  export interface ClimateValues {
    deviceLabel: string
    deviceArea: string
    deviceType: string
    temperature: number
    humidity: number
    time: Date
  }

  // Door lock
  export const enum DoorLockState {
    Locked = "LOCKED",
    Unlocked = "UNLOCKED",
  }
  export const enum PendingDoorLockState {
    Locked = "LOCKED",
    Unlocked = "UNLOCKED",
    None = "NONE",
  }
  export interface DoorLock {
    deviceLabel: string
    area: string
    method: string
    lockedState: DoorLockState
    currentLockState: DoorLockState
    pendingLockState: PendingDoorLockState
    eventTime: Date
    secureModeActive: boolean
    motorJam: boolean
    paired: boolean
  }
  export interface DoorLockRequestResponse {
    zone: string
    deviceLabel: string
    area: string
    userIndex: number
    userString: string
    method: string
    lockedState: string
    currentLockState: DoorLockState
    pendingLockState: PendingDoorLockState
    eventTime: string
    secureModeActive: boolean
    motorJam: boolean
    paired: boolean
  }

  export interface User {
    name: string
    status: string
    webAccount: string
    isCallingUser: boolean
    deviceId: string
    currentLocationId: string
    currentLocationName: string
    currentLocationTimestamp: Date
  }

  export const enum DoorWindowState {
    Close = "CLOSE",
    Open = "OPEN",
  }
  export interface DoorWindow {
    deviceLabel: string
    area: string
    state: DoorWindowState
    wired: boolean
    reportTime: Date
  }

  export function auth(
    email: string,
    password: string,
    callback: (error: any, token: string) => void,
  ): void
  export function installations(
    token: string,
    email: string,
    callback: (error: any, installations: Installation[]) => void,
  ): void
  export function overview(
    token: string,
    installation: string | Installation, // giid or installation
    callback: (error: any, overview: Overview) => void,
  ): void
  export function _apiClient(
    options: any,
    callback: (error: any, response: APIResponse, body: any) => void,
    retrying: boolean,
  ): void
  export function _buildCredientials(email: string, password: string): string

  export interface APIResponse {
    statusCode: number
    body: string
    headers: {
      [key: string]: string
    }
    request: {
      uri: {
        protocol: "https:" | "http:"
        slashes: boolean
        auth: string | null
        host: string
        port: number
        hostname: string
        hash: string | null
        search: string | null
        query: string | null
        pathname: string
        path: string
        href: string
      }
      method: string
      headers: {
        Cookie: string
        Accept: string
        Host: string
      }
    }
  }
}

interface Log {
  (...args: any[]): void
  error(...args: any[]): void
}
