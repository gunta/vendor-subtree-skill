import { Context, Effect, Layer, Option } from "effect"

import { type SettingsMergeResult } from "../config/jsonc-settings.ts"

export const mergeZedSettingsText = (_text = "{}\n"): SettingsMergeResult => ({
  _tag: "Unchanged"
})

export interface ZedSettingsShape {
  readonly refresh: (cwd: string) => Effect.Effect<Option.Option<string>, never>
}

export class ZedSettings extends Context.Service<ZedSettings, ZedSettingsShape>()(
  "ingraft/ZedSettings"
) {}

export const ZedSettingsLive = Layer.sync(ZedSettings, () => ({
  refresh: (_cwd: string) => Effect.succeed(Option.none<string>())
}))
