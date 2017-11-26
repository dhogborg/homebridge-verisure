declare module "verisure" {
    export interface Installation {
        giid: string,
        street: string
    }
    export interface Overview {
        smartPlugs: any[],
        climateValues: any[],
        armState: {
            statusType: string
        },
        doorLockStatusList: any[]
    }
    export function auth(
        email: string,
        password: string,
        callback: (error: any, token: string) => void
    ): void
    export function installations(
        token: string,
        email: string,
        callback: (error: any, installations: Installation[]) => void
    ): void
    export function overview(
        token: string,
        installation: string | Installation, // giid or installation
        callback: (error: any, overview: Overview) => void
    ): void
    export function _apiClient(
        options: any,
        callback: (error: any, response: any, body: any) => void,
        retrying: boolean
    )
    export function _buildCredientials(
        email: string,
        password: string
    ): string
}