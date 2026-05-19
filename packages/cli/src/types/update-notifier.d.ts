declare module "update-notifier" {
  export interface UpdateNotifierOptions {
    readonly pkg: {
      readonly name: string
      readonly version: string
    }
    readonly updateCheckInterval?: number
    readonly shouldNotifyInNpmScript?: boolean
    readonly distTag?: string
  }

  export interface NotifyOptions {
    readonly defer?: boolean
    readonly message?: string
    readonly isGlobal?: boolean
    readonly boxenOptions?: object
  }

  export interface UpdateInfo {
    readonly latest: string
    readonly current: string
    readonly type: string
    readonly name: string
  }

  export interface UpdateNotifier {
    readonly update?: UpdateInfo
    readonly notify: (options?: NotifyOptions) => void
    readonly fetchInfo: () => Promise<UpdateInfo>
  }

  export default function updateNotifier(options: UpdateNotifierOptions): UpdateNotifier
}
